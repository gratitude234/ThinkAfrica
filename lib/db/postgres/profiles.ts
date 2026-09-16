import "server-only";

import type {
  ProfileIdentityRecord,
  ProfilesRepository,
} from "@/lib/db/types";
import { profileVisibleSql } from "@/lib/db/profileVisibility";

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
 *     `{a,b}` and the first `.map()` in a component throws.
 *   - **`created_at` is selected as its JSON text.** PostgREST serialises a
 *     timestamptz through JSON, so `to_jsonb(...) #>> '{}'` is the same string
 *     byte for byte, where the driver's own text form would differ in its
 *     separator and offset and fail parity on every row.
 *   - **`verified` is a `NOT NULL` boolean** in the schema, and
 *     `ProfileIdentityRecord` types it as a plain boolean. The mapper defaults
 *     rather than passing null through, so an unreadable value never becomes
 *     a verified mark.
 *
 * There is no authorization here, and there is nothing to authorize: this is
 * the projection any visitor may see. Private profile fields deliberately do
 * not appear, so this method cannot leak one by omission of a check.
 */

export const PROFILE_BY_USERNAME_SQL = `
  select
    p.id,
    p.username,
    p.full_name,
    p.bio,
    p.avatar_url,
    p.professional_title,
    p.country,
    p.university,
    p.field_of_study,
    p.graduation_year,
    to_jsonb(p.interests) as interests,
    p.verified,
    p.verified_type,
    to_jsonb(p.created_at) #>> '{}' as created_at
  from public.profiles as p
  where p.username = $1
    and ${profileVisibleSql("p", "$2")}
  limit 2
`;

export function toProfileIdentityRecord(
  row: Record<string, unknown>
): ProfileIdentityRecord {
  return {
    id: String(row.id),
    username: String(row.username),
    full_name: (row.full_name as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    professional_title: (row.professional_title as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    university: (row.university as string | null) ?? null,
    field_of_study: (row.field_of_study as string | null) ?? null,
    graduation_year: toNumber(row.graduation_year),
    interests: toStringArray(row.interests),
    verified: toBoolean(row.verified),
    verified_type: (row.verified_type as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
  };
}

export function createPostgresProfilesRepository(
  executor: SqlExecutor
): ProfilesRepository {
  return {
    /**
     * A profile nobody may see is not found, which is what RLS made this
     * return through PostgREST: the policy hid the row and `maybeSingle()`
     * answered null, so the page 404ed. Without the predicate a private
     * profile would render here for anyone who guessed the username.
     */
    async findIdentityByUsername(username: string, viewerId: string | null) {
      let rows: Record<string, unknown>[];
      try {
        rows = await executor.query<Record<string, unknown>>(
          PROFILE_BY_USERNAME_SQL,
          [username, viewerId]
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
