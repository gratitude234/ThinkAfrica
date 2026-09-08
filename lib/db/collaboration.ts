import "server-only";

/**
 * Searching for someone to invite as a co-author.
 *
 * ## The rule this restores
 *
 * Two client components ran this search against the anon key:
 * `components/collaboration/CoAuthorPicker.tsx` and the research submission
 * form, with the same query in both. Neither applied any visibility rule,
 * because the `profiles` policy was applying it for them: suspended members
 * are hidden, and so is anyone whose `profile_visibility` is not `public`
 * (or `members_only` for a signed-in searcher).
 *
 * Moving the query to a direct connection removes that policy, so this uses
 * `profileVisibleSql` rather than restating the rule. It is the same helper
 * the people search and every author projection use, which is the point: a
 * second definition of "who may be seen" is how the two drift apart.
 *
 * ## The viewer is not a prop any more
 *
 * Both components excluded "myself" with `.neq("id", userId)` where `userId`
 * arrived as a prop. That is now the session's viewer. Nothing about the old
 * behaviour depended on it being forgeable, and a search is a poor place to
 * leave an identity a caller can choose.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { profileVisibleSql } from "@/lib/db/profileVisibility";
import { likeContainsPattern } from "@/lib/searchFilters";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface CoAuthorCandidate {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
}

export interface CollaborationRepository {
  /**
   * Members whose username matches, excluding the viewer.
   *
   * Ordering is unspecified on both sides, as it always has been: the query
   * had no ORDER BY, so the six results are whichever six the plan produced.
   * Recorded rather than fixed, because adding an order here would change
   * which people a writer is offered.
   */
  searchEligibleCoauthors(input: {
    query: string;
    viewerId: string;
    limit: number;
  }): Promise<CoAuthorCandidate[]>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const SEARCH_SQL = `
  select p.id, p.username, p.full_name, p.university, p.field_of_study
  from public.profiles p
  where p.username ilike $1::text
    and p.id <> $2::uuid
    and ${profileVisibleSql("p", "$2")}
  limit $3::int
`;

// ── Supabase ─────────────────────────────────────────────────────────

const SELECT = "id, username, full_name, university, field_of_study";

export function createSupabaseCollaborationRepository(
  supabase: SupabaseClient
): CollaborationRepository {
  return {
    backend: "supabase",

    async searchEligibleCoauthors({ query, viewerId, limit }) {
      const { data, error } = await supabase
        .from("profiles")
        .select(SELECT)
        .ilike("username", likeContainsPattern(query))
        .neq("id", viewerId)
        .limit(limit);

      // A failed search must not look like "nobody by that name": a writer
      // would conclude the person has no account and invite them by email.
      if (error) throw new Error(`co-author search: ${error.message}`);
      return (data ?? []) as CoAuthorCandidate[];
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresCollaborationRepository(
  executor: SqlExecutor
): CollaborationRepository {
  return {
    backend: "postgres",

    async searchEligibleCoauthors({ query, viewerId, limit }) {
      return executor.query<CoAuthorCandidate>(SEARCH_SQL, [
        likeContainsPattern(query),
        viewerId,
        limit,
      ]);
    },
  };
}
