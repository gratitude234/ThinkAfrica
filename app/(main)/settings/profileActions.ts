"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isProfilePositioningEnabled } from "@/lib/featureFlags";
import { deriveLegacyOnboardingPreference } from "@/lib/onboarding";
import {
  getPositioningStatementError,
  normalizePositioningStatement,
} from "@/lib/profileIdentity";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";
import { isProfileType, normalizeSecondaryProfileTypes } from "@/lib/profileTypes";
import {
  profileUpdateMessage,
  updateOwnProfile,
} from "@/lib/profileMutations";
import {
  fail,
  ok,
  requireViewer,
  type ActionResult,
  NOT_SIGNED_IN,
} from "@/lib/serverActions";

/**
 * Every profile mutation that used to be issued from the browser.
 *
 * Six client components wrote `public.profiles` directly, each against an id
 * it had been handed as a prop. They are one domain, not six, so they get one
 * boundary: the actions below differ only in which fields they accept and how
 * they validate them, and all of them go through `updateOwnProfile`, which
 * enforces the self-editable column allowlist and writes only the viewer's own
 * row.
 *
 * The existing section actions in ./profile/actions.ts are the same idea for
 * the profile command centre and are deliberately left alone: they already
 * derive the viewer from the session and never take a profile id.
 */

async function revalidateForViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  revalidatePath("/settings");
  revalidatePath("/settings/profile");
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  const username = (data?.username as string | undefined) ?? null;
  if (username) {
    revalidatePath(`/${username}`);
    revalidatePath(`/${username}/record`);
  }
  return username;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * Avatar and cover, which save the moment an upload finishes rather than when
 * the form is submitted. Both ProfileForm and the command centre's identity
 * section did this from the browser with a bare update.
 *
 * The URL is not trusted as a string: an arbitrary value here would let a
 * member point their avatar at any host, which is an image-based tracking
 * pixel on every page their name appears on. It has to be a Supabase Storage
 * URL for this project, or null.
 */
export async function saveProfileMedia(input: {
  avatarUrl?: string | null;
  coverImageUrl?: string | null;
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const patch: Record<string, unknown> = {};

  if (input.avatarUrl !== undefined) {
    const value = normalizeStorageUrl(input.avatarUrl);
    if (value === INVALID) return fail("That image could not be saved.");
    patch.avatar_url = value;
  }
  if (input.coverImageUrl !== undefined) {
    const value = normalizeStorageUrl(input.coverImageUrl);
    if (value === INVALID) return fail("That image could not be saved.");
    patch.cover_image_url = value;
  }

  if (Object.keys(patch).length === 0) return fail("There was nothing to save.");

  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, { viewerId: viewer.userId, patch });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  await revalidateForViewer(supabase, viewer.userId);
  return ok();
}

const INVALID = Symbol("invalid-storage-url");

/**
 * A profile image must live in this project's own storage.
 *
 * The client uploads to Supabase Storage and then reports the public URL, so
 * the only legitimate values are that host's or a relative path. Anything else
 * is either a mistake or an attempt to have every reader of a profile fetch
 * from a third party.
 */
function normalizeStorageUrl(value: string | null): string | null | typeof INVALID {
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return INVALID;
  if (trimmed.startsWith("/")) return trimmed;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return INVALID;

  let parsed: URL;
  let allowed: URL;
  try {
    parsed = new URL(trimmed);
    allowed = new URL(supabaseUrl);
  } catch {
    return INVALID;
  }

  if (parsed.protocol !== "https:") return INVALID;
  if (parsed.host !== allowed.host) return INVALID;
  return parsed.toString();
}

// ---------------------------------------------------------------------------
// The settings profile form
// ---------------------------------------------------------------------------

export interface SaveProfileDetailsInput {
  fullName: string;
  username: string;
  bio: string;
  positioningStatement: string;
  profileType: string | null;
  secondaryProfileTypes: string[];
  country: string;
  university: string;
  fieldOfStudy: string;
  graduationYear: string;
  organizationName: string;
  professionalTitle: string;
  organizationWebsite: string;
  openToMentoring: boolean;
  interests: string[];
  avatarUrl: string | null;
  coverImageUrl: string | null;
  /**
   * Whether the legacy recommendation preference needs rewriting.
   *
   * A hint, not an authorization input: the form already knows whether the
   * profile type changed, and the worst a wrong value can do is skip or repeat
   * an idempotent write to the viewer's own preference. Nothing about who is
   * acting comes from here.
   */
  syncRecommendationPreference: boolean;
}

export interface SaveProfileDetailsResult {
  username: string;
  /** True when the profile saved but the recommendation preference did not,
   *  so the form can say so rather than reporting a clean success. */
  preferenceFailed: boolean;
}

export async function saveProfileDetails(
  input: SaveProfileDetailsInput
): Promise<ActionResult<SaveProfileDetailsResult>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  // Every check the client form makes, made again. The client's copy is there
  // to give immediate feedback; this one is the one that decides.
  const username = normalizeProfileUsername(input.username);
  const usernameError = getProfileUsernameError(username);
  if (usernameError) return fail(usernameError);

  const parsedYear = input.graduationYear
    ? Number.parseInt(input.graduationYear, 10)
    : null;
  if (
    parsedYear !== null &&
    (Number.isNaN(parsedYear) || parsedYear < 2015 || parsedYear > 2040)
  ) {
    return fail("Enter a graduation year between 2015 and 2040.");
  }

  const positioningError = getPositioningStatementError(input.positioningStatement);
  if (positioningError) return fail(positioningError);

  if (input.bio.length > 300) {
    return fail("Keep your biography to 300 characters or fewer.");
  }

  const profileType = isProfileType(input.profileType) ? input.profileType : null;
  const secondaryProfileTypes = normalizeSecondaryProfileTypes(
    input.secondaryProfileTypes.filter(isProfileType),
    profileType
  );
  if (secondaryProfileTypes.length > 3) {
    return fail("Choose no more than 3 secondary profile types.");
  }

  const avatarUrl = normalizeStorageUrl(input.avatarUrl);
  const coverImageUrl = normalizeStorageUrl(input.coverImageUrl);
  if (avatarUrl === INVALID || coverImageUrl === INVALID) {
    return fail("That image could not be saved.");
  }

  const supabase = await createClient();

  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: {
      full_name: input.fullName,
      username,
      bio: input.bio,
      // Omitted entirely until the column exists. See
      // isProfilePositioningEnabled and CLAUDE.md.
      ...(isProfilePositioningEnabled()
        ? {
            positioning_statement: normalizePositioningStatement(
              input.positioningStatement
            ),
          }
        : {}),
      profile_type: profileType,
      secondary_profile_types: secondaryProfileTypes,
      country: input.country,
      university: input.university.trim(),
      field_of_study: input.fieldOfStudy,
      graduation_year: parsedYear,
      organization_name: input.organizationName.trim() || null,
      professional_title: input.professionalTitle.trim() || null,
      organization_website: input.organizationWebsite.trim() || null,
      open_to_mentoring: input.openToMentoring,
      interests: normalizeInterests(input.interests),
      avatar_url: avatarUrl,
      cover_image_url: coverImageUrl,
    },
  });

  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  // The recommendation preference is a separate RPC and a separate failure:
  // the profile is already saved by the time it runs, so it reports its own
  // outcome instead of turning a successful save into an error.
  let preferenceFailed = false;
  const nextPreference = deriveLegacyOnboardingPreference(profileType);
  if (input.syncRecommendationPreference && nextPreference.currentPath) {
    const { error } = await supabase.rpc("save_onboarding_preferences", {
      p_current_path: nextPreference.currentPath,
      p_work_category: nextPreference.workCategory,
    });
    if (error) {
      console.error("[saveProfileDetails] preference update failed", error);
      preferenceFailed = true;
    }
  }

  await revalidateForViewer(supabase, viewer.userId);
  return ok({ username, preferenceFailed });
}

function normalizeInterests(interests: string[]): string[] {
  return Array.from(
    new Map(
      (interests ?? [])
        .filter((interest): interest is string => typeof interest === "string")
        .map((interest) => interest.trim())
        .filter(Boolean)
        .slice(0, 60)
        .map((interest) => [interest.toLowerCase(), interest])
    ).values()
  );
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

/**
 * The topic follow toggle, shared by the explore grid and the topics page.
 * Both sent the whole next array of interests from the browser, which is kept:
 * the list is small, the operation is idempotent, and a set is easier to
 * reason about than a sequence of adds and removes racing each other.
 */
export async function setProfileInterests(input: {
  interests: string[];
}): Promise<ActionResult<{ interests: string[] }>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const interests = normalizeInterests(input.interests);

  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: { interests },
  });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  return ok({ interests });
}

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

const PROFILE_VISIBILITY = ["public", "members_only"] as const;
const ALLOW_MESSAGES = ["everyone", "followers_only", "nobody"] as const;

/**
 * Privacy settings are stored as a single jsonb column, which is exactly the
 * shape that must not be written through from a client. The browser used to
 * send the whole object; this rebuilds it from three validated values, so an
 * extra key cannot ride along into the column.
 */
export async function savePrivacySettings(input: {
  profileVisibility: string;
  allowMessages: string;
  showInDirectory: boolean;
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const privacy_settings = {
    profile_visibility: (PROFILE_VISIBILITY as readonly string[]).includes(
      input.profileVisibility
    )
      ? input.profileVisibility
      : "public",
    allow_messages: (ALLOW_MESSAGES as readonly string[]).includes(input.allowMessages)
      ? input.allowMessages
      : "everyone",
    show_in_directory: Boolean(input.showInDirectory),
  };

  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: { privacy_settings },
  });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  await revalidateForViewer(supabase, viewer.userId);
  return ok();
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The whole notification preferences object, saved by the settings form's
 * Save button. Same reasoning as privacy: rebuilt from the known keys rather
 * than written through, so an unknown key cannot reach the column.
 *
 * The per-switch autosave path is different and stays an RPC:
 * `set_notification_preference` writes one key inside the jsonb without a
 * read-modify-write, which is what stops two switches flipped in quick
 * succession from overwriting each other. See setNotificationPreference.
 */
export async function saveNotificationPrefs(input: {
  /** Deliberately `object` rather than a named preferences interface: this
   *  action rebuilds the column from scratch and validates every key and value
   *  itself, so it has no reason to be coupled to the client's shape. */
  prefs: object;
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const prefs: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(input.prefs ?? {})) {
    if (!/^[a-z0-9_]{1,64}$/.test(key)) continue;
    if (typeof value !== "boolean") continue;
    prefs[key] = value;
  }

  if (Object.keys(prefs).length === 0) {
    return fail("There was nothing to save.");
  }

  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: { notification_prefs: prefs },
  });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  await revalidateForViewer(supabase, viewer.userId);
  return ok();
}

/**
 * One preference switch, through the existing RPC.
 *
 * The RPC still derives the acting user from `auth.uid()`. That is a Track C
 * problem rather than a Track A one, and it is safe here for the same reason
 * it was safe before: this runs on the server, against the viewer's own
 * session, and the client cannot name a user. See
 * supabase/migrations/20260909000001_parameterize_identity_rpcs.sql for the
 * parameterised replacement and docs/rpc-identity-migration.md for the
 * rollout.
 */
export async function setNotificationPreference(input: {
  key: string;
  enabled: boolean;
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  if (!/^[a-z0-9_]{1,64}$/.test(input.key)) {
    return fail("That preference does not exist.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_notification_preference", {
    p_key: input.key,
    p_enabled: Boolean(input.enabled),
  });

  if (error) {
    console.error("[setNotificationPreference] failed", error);
    return fail("Could not save that preference. Try again.");
  }

  return ok();
}

// ---------------------------------------------------------------------------
// The profile completion gate
// ---------------------------------------------------------------------------

/**
 * The modal that blocks the app until a member has a name and a username.
 *
 * It used to write `profiles` directly with an id passed in as a prop, which
 * is the same shape as the others but on a path that runs for people who have
 * not finished signing up. The fields it may set are the three it asks for.
 */
export async function completeProfileGate(input: {
  fullName: string;
  username: string;
  university: string | null;
}): Promise<ActionResult<{ username: string }>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const fullName = input.fullName.trim();
  if (!fullName) return fail("Enter your full name.");
  if (fullName.length > 120) return fail("That name is too long.");

  const username = normalizeProfileUsername(input.username);
  const usernameError = getProfileUsernameError(username);
  if (usernameError) return fail(usernameError);

  const university = input.university?.trim() || null;
  if (university && university.length > 200) {
    return fail("That institution name is too long.");
  }

  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: { full_name: fullName, username, university },
  });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  await revalidateForViewer(supabase, viewer.userId);
  return ok({ username });
}
