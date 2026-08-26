"use server";

import { revalidatePath } from "next/cache";
import {
  FEATURE_FLAGS,
  isFeaturedWorkNotesEnabled,
  isProfilePositioningEnabled,
} from "@/lib/featureFlags";
import {
  validateFeaturedWorkSelections,
  type FeaturedWorkSelection,
} from "@/lib/featuredWork";
import { deriveLegacyOnboardingPreference } from "@/lib/onboarding";
import {
  getPositioningStatementError,
  normalizePositioningStatement,
} from "@/lib/profileIdentity";
import type { ProfileSectionKey } from "@/lib/profileCommandCenter";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";
import { isProfileType, normalizeSecondaryProfileTypes } from "@/lib/profileTypes";
import { createClient } from "@/lib/supabase/server";

export interface SectionSaveResult {
  ok: boolean;
  error?: string;
  /** Set when the username changed, so the client can hard-navigate. */
  username?: string;
}

/**
 * One shape for every section save, so the client can render dirty, saving,
 * saved and failed identically wherever it is used. A failure never clears
 * the caller's draft: the action returns and the section keeps its state.
 */
async function withOwner<T>(
  run: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
  ) => Promise<T | SectionSaveResult>
): Promise<T | SectionSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to edit your profile." };
  return run(supabase, user.id);
}

function revalidateProfile(username: string | null) {
  revalidatePath("/settings/profile");
  if (username) {
    revalidatePath(`/${username}`);
    revalidatePath(`/${username}/record`);
  }
}

async function currentUsername(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

export async function saveIdentitySection(input: {
  fullName: string;
  username: string;
  profileType: string | null;
  secondaryProfileTypes: string[];
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    const username = normalizeProfileUsername(input.username);
    const usernameError = getProfileUsernameError(username);
    if (usernameError) return { ok: false, error: usernameError };

    const profileType = isProfileType(input.profileType) ? input.profileType : null;
    if (!profileType) return { ok: false, error: "Choose a profile type." };

    const { data: taken } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", userId)
      .maybeSingle();
    if (taken) return { ok: false, error: "Username already taken." };

    const secondary = normalizeSecondaryProfileTypes(
      input.secondaryProfileTypes,
      profileType
    );

    const previousUsername = await currentUsername(supabase, userId);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: input.fullName.trim(),
        username,
        profile_type: profileType,
        secondary_profile_types: secondary,
      })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    // The private work category is re-derived only when the profile type
    // actually changed, matching the settings form: several categories share
    // one type, and deriving on every save would overwrite what onboarding set.
    const preference = deriveLegacyOnboardingPreference(profileType);
    if (preference.currentPath) {
      await supabase.rpc("save_onboarding_preferences", {
        p_current_path: preference.currentPath,
        p_work_category: preference.workCategory,
      });
    }

    revalidateProfile(previousUsername);
    if (username !== previousUsername) revalidateProfile(username);
    return { ok: true, username };
  }) as Promise<SectionSaveResult>;
}

export async function saveFocusSection(input: {
  positioningStatement: string;
  bio: string;
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    const positioningError = getPositioningStatementError(input.positioningStatement);
    if (positioningError) return { ok: false, error: positioningError };
    if (input.bio.length > 300) {
      return { ok: false, error: "Keep your biography to 300 characters or fewer." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        bio: input.bio,
        // Omitted entirely until the column exists. See
        // isProfilePositioningEnabled.
        ...(isProfilePositioningEnabled()
          ? {
              positioning_statement: normalizePositioningStatement(
                input.positioningStatement
              ),
            }
          : {}),
      })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  }) as Promise<SectionSaveResult>;
}

export async function saveTopicsSection(input: {
  interests: string[];
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    // Demonstrated topics are read from published work and are never written
    // here. Only the declared list is editable.
    const interests = Array.from(
      new Map(
        input.interests
          .map((interest) => interest.trim())
          .filter(Boolean)
          .map((interest) => [interest.toLowerCase(), interest])
      ).values()
    );

    const { error } = await supabase
      .from("profiles")
      .update({ interests })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  }) as Promise<SectionSaveResult>;
}

export async function saveBackgroundSection(input: {
  country: string;
  university: string;
  fieldOfStudy: string;
  graduationYear: string;
  professionalTitle: string;
  organizationName: string;
  organizationWebsite: string;
  openToMentoring: boolean;
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    const parsedYear = input.graduationYear ? parseInt(input.graduationYear, 10) : null;
    if (parsedYear !== null && (Number.isNaN(parsedYear) || parsedYear < 2015 || parsedYear > 2040)) {
      return { ok: false, error: "Enter a graduation year between 2015 and 2040." };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        country: input.country,
        university: input.university.trim(),
        field_of_study: input.fieldOfStudy,
        graduation_year: parsedYear,
        professional_title: input.professionalTitle.trim() || null,
        organization_name: input.organizationName.trim() || null,
        organization_website: input.organizationWebsite.trim() || null,
        open_to_mentoring: input.openToMentoring,
      })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  }) as Promise<SectionSaveResult>;
}

export async function saveVisibilitySection(input: {
  profileVisibility: string;
  allowMessages: string;
  showInDirectory: boolean;
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    const profileVisibility =
      input.profileVisibility === "members_only" ? "members_only" : "public";
    const allowMessages = ["everyone", "followers_only", "nobody"].includes(
      input.allowMessages
    )
      ? input.allowMessages
      : "everyone";

    const { error } = await supabase
      .from("profiles")
      .update({
        privacy_settings: {
          profile_visibility: profileVisibility,
          allow_messages: allowMessages,
          show_in_directory: input.showInDirectory,
        },
      })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  }) as Promise<SectionSaveResult>;
}

export async function saveOpportunitiesSection(input: {
  openToOpportunities: boolean;
  opportunityTypes: string[];
  skills: string[];
  cvUrl: string;
  linkedinUrl: string;
  visibility: string;
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    // talent_profiles keeps its own table and its own RLS. The Command Center
    // unifies the owner's experience of it, not its storage: private
    // readiness detail never moves into public.profiles.
    const { error } = await supabase.from("talent_profiles").upsert(
      {
        user_id: userId,
        open_to_opportunities: input.openToOpportunities,
        opportunity_types: input.opportunityTypes,
        cv_url: input.cvUrl.trim() || null,
        linkedin_url: input.linkedinUrl.trim() || null,
        skills: input.skills,
        visibility: input.visibility,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) return { ok: false, error: error.message };

    revalidateProfile(await currentUsername(supabase, userId));
    revalidatePath("/opportunities");
    return { ok: true };
  }) as Promise<SectionSaveResult>;
}

export async function saveFeaturedWorkSection(input: {
  selections: FeaturedWorkSelection[];
}): Promise<SectionSaveResult> {
  return withOwner(async (supabase, userId) => {
    const validation = validateFeaturedWorkSelections(input.selections);
    if (validation.error) return { ok: false, error: validation.error };

    const username = await currentUsername(supabase, userId);
    if (!username) {
      return { ok: false, error: "Complete your profile before featuring work." };
    }

    // Selection, order and notes replace atomically in one call. The v1 RPC
    // stays in use until the notes migration is applied, so a deploy that
    // lands first cannot start sending a column the database lacks.
    const { error } = isFeaturedWorkNotesEnabled()
      ? await supabase.rpc("replace_my_featured_posts_v2", {
          p_post_ids: validation.postIds,
          p_feature_notes: validation.notes,
        })
      : await supabase.rpc("replace_my_featured_posts", {
          p_post_ids: validation.postIds,
        });

    if (error) return { ok: false, error: error.message };

    revalidateProfile(username);
    return { ok: true };
  }) as Promise<SectionSaveResult>;
}

export async function saveResearchSection(input: {
  headline: string;
  overview: string;
  researchInterests: string[];
  methods: string[];
  collaborationStatus: string;
  preferredRoles: string[];
  orcidUrl: string;
  websiteUrl: string;
}): Promise<SectionSaveResult> {
  if (!FEATURE_FLAGS.research) {
    return { ok: false, error: "Research is temporarily unavailable." };
  }

  // Delegates to the existing research action so validation lives in one
  // place: ORCID format, URL safety and the headline/overview limits are the
  // research domain's rules, not the Command Center's.
  const { updateResearcherProfile } = await import("@/app/(main)/research/actions");
  const result = await updateResearcherProfile({
    headline: input.headline,
    overview: input.overview,
    researchInterests: input.researchInterests,
    methods: input.methods,
    collaborationStatus: input.collaborationStatus as never,
    preferredRoles: input.preferredRoles,
    orcidUrl: input.orcidUrl,
    websiteUrl: input.websiteUrl,
  });

  if (result.error) return { ok: false, error: result.error };
  revalidatePath("/settings/profile");
  return { ok: true };
}

export type { ProfileSectionKey };
