"use server";

import { revalidatePath } from "next/cache";
import { profileUpdateMessage, updateOwnProfile } from "@/lib/profileMutations";
import { normalizeMyPrivateProfile, retainedPrivacySettings } from "@/lib/profilePrivate";
import {
  getProfileDetailsError,
  type ProfileDetailsDraft,
} from "@/lib/profileSettings";
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
  run: (supabase: ServerClient, userId: string) => Promise<SectionSaveResult>
): Promise<SectionSaveResult> {
  const viewer = await requireViewer();
  if (!viewer) return { ok: false, error: "You must be signed in to edit your profile." };
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
  input: ProfileDetailsDraft
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
      },
    });
    if (!result.ok) return { ok: false, error: profileUpdateMessage(result.failure) };

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
          .filter((interest): interest is string => typeof interest === "string")
          .map((interest) => interest.trim())
          .filter(Boolean)
          .slice(0, 60)
          .map((interest) => [interest.toLowerCase(), interest])
      ).values()
    );

    const result = await updateOwnProfile(supabase, {
      viewerId: userId,
      patch: { interests },
    });
    if (!result.ok) return { ok: false, error: profileUpdateMessage(result.failure) };

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
      return { ok: false, error: "Could not save visibility settings. Try again." };
    }

    const result = await updateOwnProfile(supabase, {
      viewerId: userId,
      patch: {
        privacy_settings: {
          ...retainedPrivacySettings(
            normalizeMyPrivateProfile(stored.data)?.privacy_settings
          ),
          profile_visibility: profileVisibility,
          show_in_directory: Boolean(input.showInDirectory),
        },
      },
    });
    if (!result.ok) return { ok: false, error: profileUpdateMessage(result.failure) };

    revalidateProfile(await currentUsername(supabase, userId));
    return { ok: true };
  });
}
