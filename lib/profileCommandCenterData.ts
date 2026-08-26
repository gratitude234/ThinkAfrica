import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FEATURE_FLAGS,
  isFeaturedWorkNotesEnabled,
  isProfilePositioningEnabled,
} from "@/lib/featureFlags";
import { normalizeOnboardingPreference } from "@/lib/onboarding";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";
import { withNextAction, type ProfileCommandCenterModel } from "@/lib/profileCommandCenter";
import { normalizeProfileRecordSummary } from "@/lib/profileRecord";
import { loadProfileTopicIndex } from "@/lib/profileRecordData";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import { normalizeSecondaryProfileTypes, isProfileType } from "@/lib/profileTypes";
import { normalizeFeatureNote } from "@/lib/featuredWork";

const PROFILE_BASE_SELECT =
  "id, username, full_name, bio, country, university, field_of_study, graduation_year, is_alumni, open_to_mentoring, verified, verified_type, avatar_url, interests, cover_image_url, profile_type, secondary_profile_types, organization_name, professional_title, organization_website";

interface ProfileRow {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  positioning_statement?: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  is_alumni: boolean | null;
  open_to_mentoring: boolean | null;
  verified: boolean | null;
  verified_type: string | null;
  avatar_url: string | null;
  interests: string[] | null;
  cover_image_url: string | null;
  profile_type: string | null;
  secondary_profile_types: string[] | null;
  organization_name: string | null;
  professional_title: string | null;
  organization_website: string | null;
}

interface FeaturedRow {
  post_id: string;
  position: number;
  feature_note?: string | null;
}

interface FeaturedPostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  in_response_to?: string | null;
  published_at: string | null;
  created_at: string;
}

function text(value: string | null | undefined) {
  return value?.trim() ? value : "";
}

/**
 * Loads every domain the Command Center edits, in parallel where the queries
 * are independent of one another.
 *
 * Three tables, three privacy boundaries, one owner-facing model. Private
 * onboarding preference is read only to decide which identity fields this
 * author's path requires; it never reaches the returned model as data, only
 * as the `isStudentPath` flag.
 */
export async function loadProfileCommandCenter(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileCommandCenterModel | null> {
  const positioningEnabled = isProfilePositioningEnabled();
  const profileSelect = positioningEnabled
    ? `${PROFILE_BASE_SELECT}, positioning_statement`
    : PROFILE_BASE_SELECT;

  const [
    profileResult,
    privateResult,
    onboardingResult,
    summaryResult,
    featuredResult,
    followerResult,
    researchResult,
    talentResult,
  ] = await Promise.all([
    supabase.from("profiles").select(profileSelect).eq("id", userId).maybeSingle(),
    supabase.rpc("get_my_profile_private"),
    supabase.rpc("get_my_onboarding_state"),
    supabase.rpc("get_public_profile_record_summary", {
      p_profile_id: userId,
      p_include_research: FEATURE_FLAGS.research,
    }),
    supabase
      .from("profile_featured_posts")
      // feature_note is named only once its migration is applied. See
      // isFeaturedWorkNotesEnabled.
      .select(
        isFeaturedWorkNotesEnabled()
          ? "post_id, position, feature_note"
          : "post_id, position"
      )
      .eq("user_id", userId)
      .order("position", { ascending: true }),
    supabase
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("following_id", userId),
    FEATURE_FLAGS.research
      ? supabase
          .from("researcher_profiles")
          .select(
            "headline, overview, research_interests, methods, collaboration_status, preferred_roles, orcid_url, website_url"
          )
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("talent_profiles")
      .select("id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as unknown as ProfileRow | null;
  if (!profile) return null;

  // The topic index and the eligible-work count both need the author's
  // published work, so they go out together after the profile is known.
  const [topicIndex, eligibleResult] = await Promise.all([
    loadProfileTopicIndex({
      supabase,
      profileId: userId,
      declaredInterests: profile.interests,
      includeResearch: FEATURE_FLAGS.research,
    }),
    loadEligibleFeaturedPosts(supabase, userId),
  ]);

  const featuredRows = (featuredResult.data ?? []) as unknown as FeaturedRow[];
  const eligibleById = new Map(eligibleResult.map((post) => [post.id, post]));
  const featured = featuredRows.flatMap((row) => {
    const post = eligibleById.get(row.post_id);
    return [
      {
        postId: row.post_id,
        title: post ? getPostMetadataTitle(post) : "Selected work",
        note: normalizeFeatureNote(row.feature_note),
        isCoAuthor: post ? post.author_id !== userId : false,
        publishedAt: post?.published_at ?? null,
      },
    ];
  });

  const privateProfile = normalizeMyPrivateProfile(privateResult.data);
  const onboarding = normalizeOnboardingPreference(onboardingResult.data);
  const research = (researchResult.data ?? null) as {
    headline?: string | null;
    overview?: string | null;
    research_interests?: string[] | null;
    methods?: string[] | null;
    collaboration_status?: string | null;
    preferred_roles?: string[] | null;
    orcid_url?: string | null;
    website_url?: string | null;
  } | null;
  const talent = (talentResult.data ?? null) as {
    id?: string | null;
    open_to_opportunities?: boolean | null;
    opportunity_types?: string[] | null;
    cv_url?: string | null;
    linkedin_url?: string | null;
    skills?: string[] | null;
    visibility?: string | null;
  } | null;

  const privacy = (privateProfile?.privacy_settings ?? {}) as Partial<{
    profile_visibility: "public" | "members_only";
    allow_messages: "everyone" | "followers_only" | "nobody";
    show_in_directory: boolean;
  }>;

  const profileType = isProfileType(profile.profile_type) ? profile.profile_type : null;

  return withNextAction({
    identity: {
      id: profile.id,
      username: profile.username,
      fullName: text(profile.full_name),
      avatarUrl: profile.avatar_url,
      coverImageUrl: profile.cover_image_url,
      profileType,
      secondaryProfileTypes: normalizeSecondaryProfileTypes(
        profile.secondary_profile_types,
        profileType
      ),
      verified: Boolean(profile.verified),
      verifiedType: profile.verified_type,
      isAlumni: Boolean(profile.is_alumni),
    },
    focus: {
      positioningStatement: text(profile.positioning_statement),
      bio: text(profile.bio),
    },
    background: {
      country: text(profile.country),
      university: text(profile.university),
      fieldOfStudy: text(profile.field_of_study),
      graduationYear: profile.graduation_year ? String(profile.graduation_year) : "",
      professionalTitle: text(profile.professional_title),
      organizationName: text(profile.organization_name),
      organizationWebsite: text(profile.organization_website),
      openToMentoring: Boolean(profile.open_to_mentoring),
    },
    topics: {
      interests: profile.interests ?? [],
      demonstratedTopics: topicIndex.demonstratedTopics,
    },
    featured,
    research: {
      enabled: FEATURE_FLAGS.research,
      headline: text(research?.headline),
      overview: text(research?.overview),
      researchInterests: research?.research_interests ?? [],
      methods: research?.methods ?? [],
      collaborationStatus: research?.collaboration_status ?? "selective",
      preferredRoles: research?.preferred_roles ?? [],
      orcidUrl: text(research?.orcid_url),
      websiteUrl: text(research?.website_url),
    },
    opportunities: {
      talentProfileId: talent?.id ?? null,
      openToOpportunities: Boolean(talent?.open_to_opportunities),
      opportunityTypes: talent?.opportunity_types ?? [],
      skills: talent?.skills ?? [],
      cvUrl: text(talent?.cv_url),
      linkedinUrl: text(talent?.linkedin_url),
      visibility: talent?.visibility ?? "public",
    },
    visibility: {
      profileVisibility: privacy.profile_visibility ?? "public",
      allowMessages: privacy.allow_messages ?? "everyone",
      showInDirectory: privacy.show_in_directory ?? true,
    },
    recordSummary: normalizeProfileRecordSummary(summaryResult.data),
    followerCount: followerResult.count ?? 0,
    eligibleFeaturedCount: eligibleResult.length,
    isStudentPath: onboarding.currentPath
      ? onboarding.currentPath === "student"
      : profileType === "student",
    positioningEnabled,
  });
}

/**
 * The publications this author may feature: published, and either authored by
 * them or carrying an accepted co-author credit. Same rule the RPC enforces,
 * so the picker never offers something the save would reject.
 */
export async function loadEligibleFeaturedPosts(
  supabase: SupabaseClient,
  userId: string
): Promise<FeaturedPostRow[]> {
  const select =
    "id, author_id, title, slug, type, content_kind, article_format, in_response_to, published_at, created_at";

  const [ownedResult, coauthoredResult] = await Promise.all([
    supabase
      .from("posts")
      .select(select)
      .eq("author_id", userId)
      .eq("status", "published"),
    supabase
      .from("post_authors")
      .select(`posts!post_authors_post_id_fkey(${select}, status)`)
      .eq("user_id", userId)
      .not("accepted_at", "is", null),
  ]);

  const byId = new Map<string, FeaturedPostRow>();
  for (const post of (ownedResult.data ?? []) as unknown as FeaturedPostRow[]) {
    if (!FEATURE_FLAGS.research && post.type === "research") continue;
    byId.set(post.id, post);
  }
  for (const row of (coauthoredResult.data ?? []) as unknown as Array<{
    posts: (FeaturedPostRow & { status?: string }) | Array<FeaturedPostRow & { status?: string }> | null;
  }>) {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    if (!post || post.status !== "published") continue;
    if (!FEATURE_FLAGS.research && post.type === "research") continue;
    if (!byId.has(post.id)) byId.set(post.id, post);
  }

  return [...byId.values()].sort(
    (left, right) =>
      Date.parse(right.published_at ?? right.created_at) -
      Date.parse(left.published_at ?? left.created_at)
  );
}
