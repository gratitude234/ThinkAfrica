import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ProfileIdentityRecord,
  ProfilesRepository,
} from "@/lib/db/types";

/**
 * The production implementation of the public profile read: one PostgREST
 * query behind the repository interface.
 *
 * This is the default and stays the default until the domain is cut over
 * deliberately.
 */

/**
 * Exactly the columns a writer's profile renders. The publishing reset, Phase
 * 2G dropped persona, positioning, organisation and alumni columns. Profile V3
 * Phase 3 restores the optional cover image and keeps `created_at` for About.
 */
export const PROFILE_IDENTITY_SELECT =
  "id, username, full_name, bio, avatar_url, cover_image_url, professional_title, country, university, field_of_study, graduation_year, interests, organization_website, verified, verified_type, created_at";

export const supabaseProfilesRepository: ProfilesRepository = {
  // Unused, for the same reason as posts.findBySlug: RLS is applied by the
  // request client. The PostgreSQL twin reproduces it explicitly.
  async findIdentityByUsername(username: string, _viewerId: string | null) {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_IDENTITY_SELECT)
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error("[profiles] identity lookup failed", error);
      throw new Error(`Failed to load profile "${username}".`);
    }

    return (data as ProfileIdentityRecord | null) ?? null;
  },
};
