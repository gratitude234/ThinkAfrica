import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";
import type {
  ProfileSettingsModel,
  ProfileSettingsWorkOption,
} from "@/lib/profileSettings";
import { sanitizePostExcerpt } from "@/lib/utils";

/**
 * Exactly the columns Edit profile edits. The Command Center this replaced
 * read six domains to fill a preview and a topic index. Profile V3 adds one
 * deliberately narrow Selected Work read plus a bounded list of the owner
 * published Posts/Articles.
 */
const PROFILE_SETTINGS_SELECT =
  "id, username, full_name, avatar_url, cover_image_url, professional_title, bio, country, university, field_of_study, graduation_year, interests, organization_website";

interface ProfileSettingsRow {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  professional_title: string | null;
  bio: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  interests: string[] | null;
  organization_website: string | null;
}

function text(value: string | null | undefined) {
  return value?.trim() ? value : "";
}

/**
 * Null only when the query succeeded and found no row. A failure throws, so
 * an outage is an error page rather than a form that would save blanks over a
 * member's real values.
 */
export async function loadProfileSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileSettingsModel | null> {
  const [profileResult, privateResult, selectedResult, worksResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(PROFILE_SETTINGS_SELECT)
        .eq("id", userId)
        .maybeSingle(),
      supabase.rpc("get_my_profile_private"),
      supabase
        .from("profile_featured_posts")
        .select("post_id")
        .eq("user_id", userId)
        .eq("position", 1)
        .maybeSingle(),
      supabase
        .from("posts")
        .select(
          "id, title, excerpt, content_kind, published_at, created_at, cover_image_url",
        )
        .eq("author_id", userId)
        .eq("status", "published")
        .in("content_kind", ["post", "article"])
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(51),
    ]);

  if (profileResult.error) {
    throw new Error(`profile settings failed: ${profileResult.error.message}`);
  }
  const profile = profileResult.data as unknown as ProfileSettingsRow | null;
  if (!profile) return null;

  if (privateResult.error) {
    throw new Error(
      `profile visibility failed: ${privateResult.error.message}`,
    );
  }
  if (selectedResult.error) {
    throw new Error(
      `selected work settings failed: ${selectedResult.error.message}`,
    );
  }
  if (worksResult.error) {
    throw new Error(
      `published work settings failed: ${worksResult.error.message}`,
    );
  }
  const privacy = (normalizeMyPrivateProfile(privateResult.data)
    ?.privacy_settings ?? {}) as Partial<{
    profile_visibility: "public" | "members_only";
    show_in_directory: boolean;
  }>;

  const selectedWorkHasMore = (worksResult.data?.length ?? 0) > 50;
  const workRows = [...(worksResult.data ?? []).slice(0, 50)];
  const selectedWorkId = selectedResult.data?.post_id ?? null;
  let selectedWorkUnavailable = false;
  if (selectedWorkId && !workRows.some((work) => work.id === selectedWorkId)) {
    const current = await supabase
      .from("posts")
      .select(
        "id, title, excerpt, content_kind, published_at, created_at, cover_image_url",
      )
      .eq("id", selectedWorkId)
      .eq("author_id", userId)
      .eq("status", "published")
      .in("content_kind", ["post", "article"])
      .maybeSingle();
    if (current.error)
      throw new Error(
        `selected work publication settings failed: ${current.error.message}`,
      );
    if (current.data) workRows.unshift(current.data);
    else selectedWorkUnavailable = true;
  }

  const selectedWorkOptions: ProfileSettingsWorkOption[] = workRows.map(
    (work) => {
      const kind = work.content_kind === "article" ? "article" : "post";
      const fallback = kind === "article" ? "Untitled Article" : "Post";
      const title =
        kind === "article"
          ? work.title?.trim() || fallback
          : sanitizePostExcerpt(work.excerpt ?? "") || fallback;
      return {
        id: String(work.id),
        title,
        kind,
        publishedAt: work.published_at ?? null,
        excerpt: work.excerpt ? sanitizePostExcerpt(work.excerpt) : null,
        coverImageUrl: work.cover_image_url ?? null,
      };
    },
  );

  return {
    id: profile.id,
    username: profile.username,
    fullName: text(profile.full_name),
    avatarUrl: profile.avatar_url,
    coverImageUrl: profile.cover_image_url,
    headline: text(profile.professional_title),
    bio: text(profile.bio),
    country: text(profile.country),
    university: text(profile.university),
    fieldOfStudy: text(profile.field_of_study),
    graduationYear: profile.graduation_year
      ? String(profile.graduation_year)
      : "",
    interests: profile.interests ?? [],
    selectedWorkId,
    selectedWorkUnavailable,
    selectedWorkOptions,
    selectedWorkHasMore,
    website: text(profile.organization_website),
    visibility: {
      profileVisibility:
        privacy.profile_visibility === "members_only"
          ? "members_only"
          : "public",
      showInDirectory: privacy.show_in_directory ?? true,
    },
  };
}
