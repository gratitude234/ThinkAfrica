import "server-only";

import { isProfilePositioningEnabled } from "@/lib/featureFlags";
import type {
  ProfileIdentityRecord,
  ProfilesRepository,
} from "@/lib/db/types";
import type { SqlExecutor } from "@/lib/db/postgres/executor";
import {
  toBoolean,
  toNumber,
  toStringArray,
} from "@/lib/db/postgres/normalise";

/**
 * The same public profile lookup as lib/db/supabase/profiles.ts, as SQL.
 *
 * Written for behavioural identity rather than similarity, because the two
 * have to be swappable without the profile page noticing. Three places where
 * the faithful port is not the obvious one:
 *
 *   - **`interests` is `text[]`.** Selected as `to_jsonb(...)`, for the reason
 *     lib/db/postgres/normalise.ts documents at length: under
 *     `fetch_types: false` a bare array column arrives as the string
 *     `{a,b}` and the first `.map()` in a component throws. `posts.tags` cost
 *     a broken article body before this was understood.
 *   - **`positioning_statement` is conditional.** The column exists in
 *     production, but the select is gated so a preview or local database
 *     without the migration does not fail the whole query. The gate has to be
 *     in the SQL, not applied afterwards, which is why there are two
 *     statements rather than one.
 *   - **`is_alumni` and `verified` are `NOT NULL` booleans** in the schema,
 *     and `ProfileIdentityRecord` types them as plain booleans. The mapper
 *     defaults rather than passing null through, so a row that somehow lacks
 *     one does not put `null` where the type promises a boolean.
 *
 * There is no authorization here, and there is nothing to authorize: this is
 * the projection any visitor may see. Private profile fields deliberately do
 * not appear, so this method cannot leak one by omission of a check.
 */

const PROFILE_COLUMNS = `
    p.id,
    p.username,
    p.full_name,
    p.country,
    p.university,
    p.field_of_study,
    p.graduation_year,
    p.is_alumni,
    p.bio,
    p.avatar_url,
    p.cover_image_url,
    p.verified,
    p.verified_type,
    to_jsonb(p.interests) as interests,
    p.profile_type,
    p.professional_title,
    p.organization_name,
    p.organization_website`;

/** Without the positioning column. */
export const PROFILE_BY_USERNAME_SQL = `
  select${PROFILE_COLUMNS}
  from public.profiles as p
  where p.username = $1
  limit 2
`;

/** With it. Two constants rather than string assembly at call time, so both
 *  statements are inspectable and neither is built from anything dynamic. */
export const PROFILE_BY_USERNAME_WITH_POSITIONING_SQL = `
  select${PROFILE_COLUMNS},
    p.positioning_statement
  from public.profiles as p
  where p.username = $1
  limit 2
`;

export function profileByUsernameSql(): string {
  return isProfilePositioningEnabled()
    ? PROFILE_BY_USERNAME_WITH_POSITIONING_SQL
    : PROFILE_BY_USERNAME_SQL;
}

export function toProfileIdentityRecord(
  row: Record<string, unknown>
): ProfileIdentityRecord {
  const record: ProfileIdentityRecord = {
    id: String(row.id),
    username: String(row.username),
    full_name: (row.full_name as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    university: (row.university as string | null) ?? null,
    field_of_study: (row.field_of_study as string | null) ?? null,
    graduation_year: toNumber(row.graduation_year),
    is_alumni: toBoolean(row.is_alumni),
    bio: (row.bio as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    verified: toBoolean(row.verified),
    verified_type: (row.verified_type as string | null) ?? null,
    interests: toStringArray(row.interests),
    profile_type: (row.profile_type as string | null) ?? null,
    professional_title: (row.professional_title as string | null) ?? null,
    organization_name: (row.organization_name as string | null) ?? null,
    organization_website: (row.organization_website as string | null) ?? null,
  };

  // Present only when the gated select asked for it. Adding the key with a
  // null value when it was not selected would be a different shape from the
  // Supabase adapter, which omits it entirely, and the parity check compares
  // shapes.
  if ("positioning_statement" in row) {
    record.positioning_statement =
      (row.positioning_statement as string | null) ?? null;
  }

  return record;
}

export function createPostgresProfilesRepository(
  executor: SqlExecutor
): ProfilesRepository {
  return {
    async findIdentityByUsername(username: string) {
      let rows: Record<string, unknown>[];
      try {
        rows = await executor.query<Record<string, unknown>>(
          profileByUsernameSql(),
          [username]
        );
      } catch (error) {
        // Same shape as the Supabase implementation, so a reader of the logs
        // does not have to know which adapter was live to search for it.
        console.error("[profiles] identity lookup failed", error);
        throw new Error(`Failed to load profile "${username}".`);
      }

      // `username` is UNIQUE, so two rows means the constraint is gone. The
      // Supabase path uses `.maybeSingle()`, which fails the same way rather
      // than picking one; asking for two rows is how that is reproduced.
      if (rows.length > 1) {
        console.error("[profiles] identity lookup failed", {
          message: `username matched ${rows.length} rows`,
        });
        throw new Error(`Failed to load profile "${username}".`);
      }

      return rows.length === 0 ? null : toProfileIdentityRecord(rows[0]);
    },
  };
}
