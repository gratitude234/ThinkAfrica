import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";
import type { ProfileSettingsModel } from "@/lib/profileSettings";

/**
 * Exactly the columns Edit profile edits. The Command Center this replaced
 * read six domains to fill a preview, featured work and a topic index; this is
 * the profile row and the private visibility settings, two reads.
 */
const PROFILE_SETTINGS_SELECT =
  "id, username, full_name, avatar_url, professional_title, bio, country, university, field_of_study, graduation_year, interests";

interface ProfileSettingsRow {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  professional_title: string | null;
  bio: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  interests: string[] | null;
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
  userId: string
): Promise<ProfileSettingsModel | null> {
  const [profileResult, privateResult] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SETTINGS_SELECT).eq("id", userId).maybeSingle(),
    supabase.rpc("get_my_profile_private"),
  ]);

  if (profileResult.error) {
    throw new Error(`profile settings failed: ${profileResult.error.message}`);
  }
  const profile = profileResult.data as unknown as ProfileSettingsRow | null;
  if (!profile) return null;

  if (privateResult.error) {
    throw new Error(`profile visibility failed: ${privateResult.error.message}`);
  }
  const privacy = (normalizeMyPrivateProfile(privateResult.data)?.privacy_settings ??
    {}) as Partial<{
    profile_visibility: "public" | "members_only";
    show_in_directory: boolean;
  }>;

  return {
    id: profile.id,
    username: profile.username,
    fullName: text(profile.full_name),
    avatarUrl: profile.avatar_url,
    headline: text(profile.professional_title),
    bio: text(profile.bio),
    country: text(profile.country),
    university: text(profile.university),
    fieldOfStudy: text(profile.field_of_study),
    graduationYear: profile.graduation_year ? String(profile.graduation_year) : "",
    interests: profile.interests ?? [],
    visibility: {
      profileVisibility:
        privacy.profile_visibility === "members_only" ? "members_only" : "public",
      showInDirectory: privacy.show_in_directory ?? true,
    },
  };
}
