import "server-only";

/**
 * The comment thread's reads, as PostgreSQL.
 *
 * Three business operations: a page of top-level comments, the replies to
 * them, and which of them the viewer has voted on. Plus the count the heading
 * shows, which is deliberately not `comments.length`.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## Two policies, and the difference between them
 *
 * `comments` hides moderated rows from everyone except their author and an
 * admin. `profiles` hides suspended and private members. The thread reads both
 * through the *viewer's* client, so PostgREST applied both, and this module
 * carries both explicitly. They are applied in different places and that is
 * not a detail:
 *
 * - The comment rule is a WHERE clause. A hidden comment is not a comment.
 * - The profile rule is a JOIN condition. An invisible author leaves the
 *   comment in place with no name, which is what the embed did.
 *
 * ## What stays in TypeScript
 *
 * Blocking. `getBlockedUserIds` is the viewer's own block list and belongs to
 * viewer state rather than to the thread; the filter stays where it was so the
 * two cannot disagree about what a block means. Moving it into SQL would also
 * break the page-size arithmetic below, which counts rows before blocking.
 *
 * ## The page size is deliberately approximate
 *
 * The top-level query asks for `pageSize + 1` and the caller then removes
 * blocked authors, so a page can come back short. That is what the PostgREST
 * version did, and `hasMore` is computed the same way from the same over-fetch.
 * Making it exact would need the block list inside the query, which is the
 * thing the paragraph above says not to do.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { commentVisibleSql } from "@/lib/db/commentVisibility";
import { visibleProfileJoin } from "@/lib/db/profileVisibility";
import type { CommentSort } from "@/lib/commentSort";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  upvotes: number;
  parent_id: string | null;
  author_id: string;
  profiles:
    | { username: string | null; full_name: string | null; avatar_url: string | null }
    | Array<{
        username: string | null;
        full_name: string | null;
        avatar_url: string | null;
      }>
    | null;
}

export interface TopLevelCommentQuery {
  postId: string;
  viewerId: string | null;
  sort: CommentSort;
  /** Keyset cursor from the previous page. `null` is the first page. */
  cursorCreatedAt: string | null;
  /** Only meaningful under the `top` sort, where score is the primary key. */
  cursorUpvotes: number | null;
  limit: number;
}

export interface CommentsRepository {
  /** One page of top-level comments, newest or highest first. */
  topLevel(query: TopLevelCommentQuery): Promise<CommentRow[]>;
  /** Every reply to the given parents, oldest first within each thread. */
  replies(parentIds: string[], viewerId: string | null): Promise<CommentRow[]>;
  /** Which of these comments the viewer has already voted on. */
  votedCommentIds(commentIds: string[], voterId: string): Promise<string[]>;
  /** Total visible comments on a post, for the heading. */
  count(postId: string, viewerId: string | null): Promise<number>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const COMMENT_COLUMNS = `
    c.id,
    c.content,
    c.created_at,
    c.updated_at,
    c.upvotes,
    c.parent_id,
    c.author_id,
    case when a.id is null then null else jsonb_build_object(
      'username', a.username,
      'full_name', a.full_name,
      'avatar_url', a.avatar_url
    ) end as profiles`;

/**
 * The keyset cursor, as a predicate rather than as an offset.
 *
 * Under `new` the key is `created_at` alone. Under `top` it is the pair
 * `(upvotes, created_at)`, because every comment sharing a score would
 * otherwise repeat or vanish across a page boundary. The pair is compared as a
 * pair, which is the same thing the PostgREST `or=` filter expressed and is
 * far easier to read as SQL.
 *
 * `$4` is the created_at cursor and `$5` the upvotes cursor. Both null on the
 * first page, and the predicate then admits everything.
 */
const TOP_LEVEL_NEW_SQL = `
  select${COMMENT_COLUMNS}
  from public.comments c
  ${visibleProfileJoin("a", "c.author_id", "$2")}
  where c.post_id = $1::uuid
    and c.parent_id is null
    and ${commentVisibleSql("c", "$2")}
    and ($4::timestamptz is null or c.created_at < $4::timestamptz)
  order by c.created_at desc
  limit $3::int
`;

const TOP_LEVEL_TOP_SQL = `
  select${COMMENT_COLUMNS}
  from public.comments c
  ${visibleProfileJoin("a", "c.author_id", "$2")}
  where c.post_id = $1::uuid
    and c.parent_id is null
    and ${commentVisibleSql("c", "$2")}
    and (
      $4::timestamptz is null
      or $5::int is null
      or (c.upvotes, c.created_at) < ($5::int, $4::timestamptz)
    )
  order by c.upvotes desc, c.created_at desc
  limit $3::int
`;

/** Oldest-first within a thread, so an exchange reads downwards. */
const REPLIES_SQL = `
  select${COMMENT_COLUMNS}
  from public.comments c
  ${visibleProfileJoin("a", "c.author_id", "$2")}
  where c.parent_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
    and ${commentVisibleSql("c", "$2")}
  order by c.created_at asc
`;

const VOTED_SQL = `
  select v.comment_id
  from public.comment_votes v
  where v.user_id = $2::uuid
    and v.comment_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
`;

/**
 * The heading's count.
 *
 * A separate statement rather than `comments.length`, so the number is right
 * when only the first page is loaded. It counts every visible comment on the
 * post, replies included, which is what `count: "exact"` over the unfiltered
 * table did.
 */
const COUNT_SQL = `
  select count(*) as total
  from public.comments c
  where c.post_id = $1::uuid
    and ${commentVisibleSql("c", "$2")}
`;

// ── Shared ───────────────────────────────────────────────────────────

const COMMENT_SELECT =
  "id, content, created_at, updated_at, upvotes, parent_id, author_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)";

function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
}

// ── Supabase ─────────────────────────────────────────────────────────

export function createSupabaseCommentsRepository(
  supabase: SupabaseClient
): CommentsRepository {
  return {
    backend: "supabase",

    async topLevel(query) {
      // The viewer is unused on this side: the request client carries the
      // session, so both policies are applied by the database. Calling this
      // with the admin client would leak moderated comments, which is why the
      // caller has always been told not to.
      let request = supabase
        .from("comments")
        .select(COMMENT_SELECT)
        .eq("post_id", query.postId)
        .is("parent_id", null)
        .limit(query.limit);

      request =
        query.sort === "top"
          ? request
              .order("upvotes", { ascending: false })
              .order("created_at", { ascending: false })
          : request.order("created_at", { ascending: false });

      if (query.cursorCreatedAt) {
        request =
          query.sort === "top" && query.cursorUpvotes !== null
            ? request.or(
                `upvotes.lt.${query.cursorUpvotes},and(upvotes.eq.${query.cursorUpvotes},created_at.lt.${query.cursorCreatedAt})`
              )
            : request.lt("created_at", query.cursorCreatedAt);
      }

      return rows<CommentRow>(await request, "comment page failed");
    },

    async replies(parentIds, _viewerId) {
      if (parentIds.length === 0) return [];
      const result = await supabase
        .from("comments")
        .select(COMMENT_SELECT)
        .in("parent_id", parentIds)
        .order("created_at", { ascending: true });
      return rows<CommentRow>(result, "comment replies failed");
    },

    async votedCommentIds(commentIds, voterId) {
      if (commentIds.length === 0) return [];
      const result = await supabase
        .from("comment_votes")
        .select("comment_id")
        .eq("user_id", voterId)
        .in("comment_id", commentIds);
      return rows<{ comment_id: string }>(result, "comment votes failed").map(
        (vote) => vote.comment_id
      );
    },

    async count(postId, _viewerId) {
      const result = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (result.error) {
        throw new Error(`comment count failed: ${result.error.message}`);
      }
      return result.count ?? 0;
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresCommentsRepository(
  executor: SqlExecutor
): CommentsRepository {
  return {
    backend: "postgres",

    async topLevel(query) {
      const shared = [
        query.postId,
        query.viewerId,
        query.limit,
        query.cursorCreatedAt,
      ];

      // Only the parameters the statement actually names. An unreferenced
      // parameter has no type to infer, and with fetch_types: false the
      // driver cannot supply one either: Postgres refuses the statement with
      // "could not determine data type of parameter", and the thread fails to
      // load. Caught by the behavioural proof rather than in production.
      return query.sort === "top"
        ? executor.query<CommentRow>(TOP_LEVEL_TOP_SQL, [
            ...shared,
            query.cursorUpvotes,
          ])
        : executor.query<CommentRow>(TOP_LEVEL_NEW_SQL, shared);
    },

    async replies(parentIds, viewerId) {
      if (parentIds.length === 0) return [];
      return executor.query<CommentRow>(REPLIES_SQL, [
        JSON.stringify(parentIds),
        viewerId,
      ]);
    },

    async votedCommentIds(commentIds, voterId) {
      if (commentIds.length === 0) return [];
      const result = await executor.query<{ comment_id: string }>(VOTED_SQL, [
        JSON.stringify(commentIds),
        voterId,
      ]);
      return result.map((vote) => vote.comment_id);
    },

    async count(postId, viewerId) {
      const [row] = await executor.query<{ total: string | number }>(COUNT_SQL, [
        postId,
        viewerId,
      ]);
      // count(*) is a bigint, which arrives as a string.
      return row ? Number(row.total) : 0;
    },
  };
}
