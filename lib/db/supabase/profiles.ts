import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isProfilePositioningEnabled } from "@/lib/featureFlags";
import type {
  ProfileIdentityRecord,
  ProfilesRepository,
} from "@/lib/db/types";

/**
 * The production implementation of the public profile read: the same PostgREST
 * query `lib/profileViewData.ts` has always run, moved behind the repository
 * interface without a filter changing.
 *
 * This is the default and stays the default until the domain is cut over
 * deliberately.
 */

const PROFILE_BASE_SELECT =
  "id, username, full_name, country, university, field_of_study, graduation_year, is_alumni, bio, avatar_url, cover_image_url, verified, verified_type, interests, profile_type, professional_title, organization_name, organization_website";

/**
 * The positioning column is named only once its migration has been applied.
 * Production is confirmed to have it; the gate stays because preview and local
 * environments are not guaranteed to, and PostgREST rejects the whole select
 * over one unknown column name. See isProfilePositioningEnabled.
 */
export function profileIdentitySelect(): string {
  return isProfilePositioningEnabled()
    ? `${PROFILE_BASE_SELECT}, positioning_statement`
    : PROFILE_BASE_SELECT;
}

export const supabaseProfilesRepository: ProfilesRepository = {
  async findIdentityByUsername(username: string) {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select(profileIdentitySelect())
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("[profiles] identity lookup failed", error);
      throw new Error(`Failed to load profile "${username}".`);
    }

    return (data as ProfileIdentityRecord | null) ?? null;
  },
};
