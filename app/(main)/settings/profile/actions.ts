"use server";

import { revalidatePath } from "next/cache";
import { profileUpdateMessage, updateOwnProfile } from "@/lib/profileMutations";
import {
  normalizeMyPrivateProfile,
  retainedPrivacySettings,
} from "@/lib/profilePrivate";
import {
  getProfileDetailsError,
  type ProfileDetailsDraft,
  type ProfileSettingsWorkOption,
} from "@/lib/profileSettings";
import { safeExternalProfileUrl } from "@/lib/profileWebsite";
import { sanitizePostExcerpt } from "@/lib/utils";
import { normalizeProfileUsername } from "@/lib/profileUsername";
import { requireViewer } from "@/lib/serverActions";
import { createClient } from "@/lib/supabase/server";

export interface SectionSaveResult {
  ok: boolean;
  error?: string;
  /** Set when the Profile section saved, so the client can follow a new username. */
  username?: string;
}

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * One shape for every section save, so the client renders dirty, saving,
 * saved and failed identically. The viewer comes from the session; no action
 * takes a profile id. Every write goes through `updateOwnProfile`, which holds
 * the self-editable column allowlist, and none of them writes a retired field.
 */
async function withViewer(
  run: (supabase: ServerClient, userId: string) => Promise<SectionSaveResult>,
): Promise<SectionSaveResult> {
  const viewer = await requireViewer();
  if (!viewer)
    return { ok: false, error: "You must be signed in to edit your profile." };
  return run(await createClient(), viewer.userId);
}

async function currentUsername(supabase: ServerClient, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return (data?.username as string | undefined) ?? null;
}

function revalidateProfile(username: string | null) {
  revalidatePath("/settings/profile");
  if (username) revalidatePath(`/${username}`);
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function saveProfileSection(
  input: ProfileDetailsDraft,
): Promise<SectionSaveResult> {
  return withViewer(async (supabase, userId) => {
    const draft: ProfileDetailsDraft = {
      fullName: String(input.fullName ?? ""),
      username: String(input.username ?? ""),
      headline: String(input.headline ?? ""),
      bio: String(input.bio ?? ""),
      country: String(input.country ?? ""),
      university: String(input.university ?? ""),
      fieldOfStudy: String(input.fieldOfStudy ?? ""),
      graduationYear: String(input.graduationYear ?? ""),
      ...(Object.hasOwn(input, "website")
        ? { website: String(input.website ?? "") }
        : {}),
    };
    const problem = getProfileDetailsError(draft);
    if (problem) return { ok: false, error: problem };

    const username = normalizeProfileUsername(draft.username);
    const previousUsername = await currentUsername(supabase, userId);
    const year = draft.graduationYear.trim();

    const result = await updateOwnProfile(supabase, {
      viewerId: userId,
      patch: {
        full_name: draft.fullName.trim(),
        username,
        professional_title: optionalText(draft.headline),
        bio: draft.bio.trim(),
        country: optionalText(draft.country),
        university: optionalText(draft.university),
        field_of_study: optionalText(draft.fieldOfStudy),
        graduation_year: year ? Number(year) : null,
        ...(draft.website !== undefined
          ? { organization_website: safeExternalProfileUrl(draft.website) }
          : {}),
      },
    });
    if (!result.ok)
      return { ok: false, error: profileUpdateMessage(result.failure) };

    revalidateProfile(previousUsername);
    if (username !== previousUsername) revalidateProfile(username);
    return { ok: true, username };
  });
}

export async function saveTopicsSection(input: {
  interests: string[];
}): Promise<SectionSaveResult> {
  return withViewer(async (supabase, userId) => {
    // Deduplicated case-insensitively, keeping the first spelling. Interests an
    // older signup typed stay selectable, so a save does not drop them.
    const interests = Array.from(
      new Map(
        (Array.isArray(input.interests) ? input.interests : [])
          .filter(
            (interest): interest is string => typeof interest === "string",
          )
          .map((interest) => interest.trim())
          .filter(Boolean)
          .slice(0, 60)
          .map((interest) => [interest.toLowerCase(), interest]),
      ).values(),
    );

    const result = await updateOwnProfile(supabase, {
      viewerId: userId,
      patch: { interests },
    });
    if (!result.ok)
      return { ok: false, error: profileUpdateMessage(result.failure) };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  });
}

export async function saveSelectedWorkSection(input: {
  postId: string | null;
}): Promise<SectionSaveResult> {
  return withViewer(async (supabase, userId) => {
    const postId =
      typeof input.postId === "string" && input.postId.trim()
        ? input.postId.trim()
        : null;
    const result = await supabase.rpc("set_my_selected_work", {
      p_post_id: postId,
    });
    if (result.error) {
      return {
        ok: false,
        error:
          result.error.message || "Could not save selected work. Try again.",
      };
    }

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  });
}

export async function saveVisibilitySection(input: {
  profileVisibility: string;
  showInDirectory: boolean;
}): Promise<SectionSaveResult> {
  return withViewer(async (supabase, userId) => {
    const profileVisibility =
      input.profileVisibility === "members_only" ? "members_only" : "public";

    // The column is rebuilt from the validated values, except for a retired
    // key already stored, which is carried forward: see retainedPrivacySettings.
    const stored = await supabase.rpc("get_my_profile_private");
    if (stored.error) {
      return {
        ok: false,
        error: "Could not save visibility settings. Try again.",
      };
    }

    const result = await updateOwnProfile(supabase, {
      viewerId: userId,
      patch: {
        privacy_settings: {
          ...retainedPrivacySettings(
            normalizeMyPrivateProfile(stored.data)?.privacy_settings,
          ),
          profile_visibility: profileVisibility,
          show_in_directory: Boolean(input.showInDirectory),
        },
      },
    });
    if (!result.ok)
      return { ok: false, error: profileUpdateMessage(result.failure) };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  });
}

/** Search/page over all of the signed-in owner's published work, with SQL parameters. */
export async function loadSelectedWorkPage(input: {
  query: string;
  page: number;
}): Promise<{
  ok: boolean;
  items: ProfileSettingsWorkOption[];
  hasMore: boolean;
  error?: string;
}> {
  const viewer = await requireViewer();
  if (!viewer)
    return {
      ok: false,
      items: [],
      hasMore: false,
      error: "Sign in to browse your published work.",
    };
  if (
    typeof input.query !== "string" ||
    input.query.length > 100 ||
    !Number.isInteger(input.page) ||
    input.page < 0 ||
    input.page > 1000
  )
    return {
      ok: false,
      items: [],
      hasMore: false,
      error: "That search is invalid.",
    };
  try {
    const supabase = await createClient();
    const result = await supabase.rpc("search_my_profile_work", {
      p_query: input.query.trim(),
      p_page: input.page,
      p_page_size: 50,
    });
    if (result.error)
      return {
        ok: false,
        items: [],
        hasMore: false,
        error: "Could not load your work. Try again.",
      };
    const rows = (result.data ?? []) as Array<{
      id: string;
      title: string | null;
      excerpt: string | null;
      content_kind: string;
      published_at: string | null;
      cover_image_url: string | null;
    }>;
    return {
      ok: true,
      hasMore: rows.length > 50,
      items: rows.slice(0, 50).map((row) => ({
        id: row.id,
        kind: row.content_kind === "article" ? "article" : "post",
        publishedAt: row.published_at,
        title:
          row.content_kind === "article"
            ? row.title?.trim() || "Untitled Article"
            : sanitizePostExcerpt(row.excerpt ?? "") || "Post",
        excerpt: row.excerpt ? sanitizePostExcerpt(row.excerpt) : null,
        coverImageUrl: row.cover_image_url,
      })),
    };
  } catch {
    return {
      ok: false,
      items: [],
      hasMore: false,
      error: "Could not load your work. Try again.",
    };
  }
}
