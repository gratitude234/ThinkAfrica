import "server-only";

/**
 * The viewer's own state: who they have blocked, who has blocked them, and
 * whether a pair of people may message each other.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## No policy to reproduce here, and why that is worth saying
 *
 * Every read in this module goes through the admin client or through a
 * `SECURITY DEFINER` function on the PostgREST side, so RLS was never in force
 * and the direct port sees exactly the same rows. That is a fact about these
 * particular call sites rather than about `user_blocks`, and it is stated so
 * that a later reader does not take its absence as a pattern. The rule is the
 * one applied everywhere else in `lib/db`: check what the call site was
 * actually reading through before deciding a policy adds nothing.
 *
 * ## The failure behaviour is deliberately soft, and stays that way
 *
 * `getBlockedUserIds` and its neighbours return `[]` when the query fails,
 * unless the caller passes `strict`. That is not the bug this migration has
 * caught elsewhere: it is a documented choice, made because a feed that
 * refuses to render is worse than a feed that briefly under-applies a block,
 * and the callers that cannot accept that pass `strict`. The repository
 * therefore throws and the caller decides, which keeps the choice in one place
 * instead of burying it in SQL.
 *
 * ## An injection shape that goes away for free
 *
 * Two of these built PostgREST `or=` filters by interpolating a user id into a
 * string. The ids come from the server so nothing was exploitable, but the
 * shape is the one that broke search, and it does not survive the move: a
 * bound parameter cannot be read as grammar.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface ViewerStateRepository {
  /** Ids this user has blocked. The blocker's own view. */
  blockedUserIds(userId: string): Promise<string[]>;
  /** Ids in either direction of a block, for public-content eligibility. */
  blockRelatedUserIds(userId: string): Promise<string[]>;
  /**
   * Which of these posts credit any of these people as an accepted author.
   *
   * Closes the gap where filtering on `posts.author_id` alone would let a
   * blocked person back onto the page through a co-authored publication.
   */
  postIdsWithAuthors(postIds: string[], authorIds: string[]): Promise<string[]>;
  /** True when either has blocked the other. */
  isBlockedPair(userA: string, userB: string): Promise<boolean>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const BLOCKED_SQL = `
  select b.blocked_id
  from public.user_blocks b
  where b.blocker_id = $1::uuid
`;

/**
 * Both directions, already reduced to "the other person" and with the viewer
 * removed, so the caller receives the same set it used to build in TypeScript.
 *
 * A self-block would otherwise put the viewer in their own exclusion list,
 * which reads as an empty feed rather than as a data problem.
 */
const BLOCK_RELATED_SQL = `
  select distinct
    case when b.blocker_id = $1::uuid then b.blocked_id else b.blocker_id end
      as other_id
  from public.user_blocks b
  where (b.blocker_id = $1::uuid or b.blocked_id = $1::uuid)
    and case when b.blocker_id = $1::uuid then b.blocked_id else b.blocker_id end
        is distinct from $1::uuid
`;

const POSTS_WITH_AUTHORS_SQL = `
  select distinct a.post_id
  from public.post_authors a
  where a.post_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
    and a.user_id in (select (jsonb_array_elements_text($2::text::jsonb))::uuid)
    and a.accepted_at is not null
`;

/**
 * The database function, called rather than reimplemented.
 *
 * `is_blocked_pair(user_a, user_b)` already takes both people as parameters
 * and reads no request context, so it is one of the few functions that works
 * unchanged over a direct connection. Reimplementing it here would create a
 * second definition of "blocked", and the two would eventually disagree.
 */
const BLOCKED_PAIR_SQL = `
  select public.is_blocked_pair($1::uuid, $2::uuid) as blocked
`;

// ── Supabase ─────────────────────────────────────────────────────────

function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
}

export function createSupabaseViewerStateRepository(
  supabase: SupabaseClient
): ViewerStateRepository {
  return {
    backend: "supabase",

    async blockedUserIds(userId) {
      const result = await supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("blocker_id", userId);
      return rows<{ blocked_id: string }>(result, "blocked user ids").map(
        (row) => row.blocked_id
      );
    },

    async blockRelatedUserIds(userId) {
      const result = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      const pairs = rows<{ blocker_id: string; blocked_id: string }>(
        result,
        "feed block exclusions"
      );
      return Array.from(
        new Set(
          pairs
            .map((row) => (row.blocker_id === userId ? row.blocked_id : row.blocker_id))
            .filter((id): id is string => Boolean(id && id !== userId))
        )
      );
    },

    async postIdsWithAuthors(postIds, authorIds) {
      if (postIds.length === 0 || authorIds.length === 0) return [];
      const result = await supabase
        .from("post_authors")
        .select("post_id")
        .in("post_id", postIds)
        .in("user_id", authorIds)
        .not("accepted_at", "is", null);

      return Array.from(
        new Set(
          rows<{ post_id: string }>(result, "excluded co-authored posts").map(
            (row) => row.post_id
          )
        )
      );
    },

    async isBlockedPair(userA, userB) {
      const { data, error } = await supabase.rpc("is_blocked_pair", {
        user_a: userA,
        user_b: userB,
      });
      if (error) throw new Error(`blocked pair check: ${error.message}`);
      return data === true;
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresViewerStateRepository(
  executor: SqlExecutor
): ViewerStateRepository {
  return {
    backend: "postgres",

    async blockedUserIds(userId) {
      const result = await executor.query<{ blocked_id: string }>(BLOCKED_SQL, [
        userId,
      ]);
      return result.map((row) => row.blocked_id);
    },

    async blockRelatedUserIds(userId) {
      const result = await executor.query<{ other_id: string }>(
        BLOCK_RELATED_SQL,
        [userId]
      );
      return result.map((row) => row.other_id);
    },

    async postIdsWithAuthors(postIds, authorIds) {
      if (postIds.length === 0 || authorIds.length === 0) return [];
      const result = await executor.query<{ post_id: string }>(
        POSTS_WITH_AUTHORS_SQL,
        [JSON.stringify(postIds), JSON.stringify(authorIds)]
      );
      return result.map((row) => row.post_id);
    },

    async isBlockedPair(userA, userB) {
      const [row] = await executor.query<{ blocked: boolean | null }>(
        BLOCKED_PAIR_SQL,
        [userA, userB]
      );
      return row?.blocked === true;
    },
  };
}
