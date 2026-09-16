import "server-only";

/**
 * The feed's shared reads, as PostgreSQL.
 *
 * ## What is here and why
 *
 * `lib/feedData.ts` hydrates every list of posts the same way: given some post
 * ids and their author ids, fetch three aggregates, the author profiles, and
 * the viewer's own likes and bookmarks. That is six PostgREST round trips, and
 * it runs for every page of Home and of the Explore shelves.
 *
 * One statement replaces all six.
 *
 * The publishing reset, Phase 2F, removed the reference count and the accepted
 * co-author list from this hydration, and the second lookup that resolved
 * co-author names. Feed cards show neither, and the ranking reads neither.
 *
 * ## The count semantics are not obvious and are preserved exactly
 *
 * - `like_count` comes from `post_like_counts` and has **no** row-count
 *   fallback. `posts.like_count` was dropped in 20260715000004 and the
 *   aggregate has been authoritative since; counting `likes` here would be a
 *   different number, not a safer one.
 * - `bookmark_count` comes from its aggregate table and **does** fall back to
 *   counting rows, which is what `readAggregateCounts` does when the aggregate
 *   table has no row yet. The fallback is a `coalesce` here rather than a
 *   second round trip.
 * - `comment_count` is per viewer, deliberately. See below.
 *
 * ## The comment count carries an RLS policy that no longer exists
 *
 * On Supabase this count is issued with the *viewer's* client, because the
 * SELECT policy on `comments` is what hides moderated rows:
 *
 *     (hidden_at IS NULL) OR (auth.uid() = author_id) OR is_admin()
 *
 * A direct connection has no RLS and no `auth.uid()`, so that predicate is
 * written out in the SQL below. The viewer id is a parameter the server
 * resolved; `is_admin()` is inlined rather than passed, because its whole body
 * is a `profiles.role` lookup on that same id and a caller-supplied flag could
 * be wrong or stale. Getting this wrong in the permissive direction would show
 * every reader the count of hidden comments; getting it wrong in the strict
 * direction would stop an author seeing their own.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { commentVisibleSql } from "@/lib/db/commentVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface FeedViewer {
  /** Resolved by the server. Null for a logged-out reader.
   *
   *  There is deliberately no `isAdmin` here. The comment-visibility rule
   *  needs it, and taking it as a field would mean a caller could get it
   *  wrong or let it go stale. The SQL resolves it the same way `is_admin()`
   *  does, from `profiles.role` on this id, so the two cannot drift. */
  id: string | null;
}

export interface FeedPostCounts {
  postId: string;
  likeCount: number;
  bookmarkCount: number;
  commentCount: number;
  viewerLiked: boolean;
  viewerBookmarked: boolean;
}

export interface FeedAuthorProfile {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  verified: boolean;
  verified_type: string | null;
}

export interface FeedHydration {
  counts: FeedPostCounts[];
  profiles: FeedAuthorProfile[];
}

export interface FeedRepository {
  /** Six PostgREST round trips in one statement. */
  hydrate(input: {
    postIds: readonly string[];
    authorIds: readonly string[];
    viewer: FeedViewer;
  }): Promise<FeedHydration>;
  readonly backend: "supabase" | "postgres";
}

// ── PostgreSQL ───────────────────────────────────────────────────────

/**
 * One statement, two result columns.
 *
 * The ids arrive as jsonb and are unnested in SQL. That is not a stylistic
 * choice: `fetch_types: false` means the driver cannot serialise an array
 * parameter, and `$n::jsonb` makes it double-encode an already-serialised one.
 * `$n::text::jsonb` is the shape that survives, and it is the same trick
 * `lib/db/postWrites.ts` and `lib/db/postPage.ts` use.
 *
 * Parameters:
 *   $1 post ids (json array)
 *   $2 author ids (json array)
 *   $3 viewer id, or null
 */
const HYDRATE_SQL = `
  with ids as (
    select value::uuid as id
    from jsonb_array_elements_text($1::text::jsonb) as value
  ),
  author_ids as (
    select value::uuid as id
    from jsonb_array_elements_text($2::text::jsonb) as value
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'post_id', i.id,

        -- The maintained aggregate, with no fallback. See the note above.
        'like_count', coalesce(
          (select lc.like_count from public.post_like_counts lc where lc.post_id = i.id),
          0
        ),

        -- Aggregate first, row count when the aggregate has no row yet.
        'bookmark_count', coalesce(
          (select bc.bookmark_count from public.post_bookmark_counts bc where bc.post_id = i.id),
          (select count(*) from public.bookmarks b where b.post_id = i.id)
        ),

        -- The RLS SELECT policy on comments, shared with the comment thread
        -- so the feed's count and the thread's list cannot disagree about
        -- what a visible comment is. See lib/db/commentVisibility.ts.
        'comment_count', (
          select count(*) from public.comments c
          where c.post_id = i.id
            and ${commentVisibleSql("c", "$3")}
        ),

        'viewer_liked', ($3::uuid is not null and exists(
          select 1 from public.likes l
          where l.post_id = i.id and l.user_id = $3::uuid
        )),
        'viewer_bookmarked', ($3::uuid is not null and exists(
          select 1 from public.bookmarks b
          where b.post_id = i.id and b.user_id = $3::uuid
        ))
      ))
      from ids as i
    ), '[]'::jsonb) as counts,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'full_name', p.full_name,
        'university', p.university,
        'avatar_url', p.avatar_url,
        'verified', p.verified,
        'verified_type', p.verified_type
      ))
      from public.profiles as p
      where p.id in (select id from author_ids)
    ), '[]'::jsonb) as profiles
`;

/**
 * A database error is an error, not an empty list.
 *
 * The PostgREST calls this replaced went through `expectRows`, which threw on
 * `result.error`. Reading `.data` and ignoring `.error` would turn an outage
 * into a feed with no cards, reported as success:
 * exactly the shape of failure this whole migration exists to stop hiding.
 *
 * The message and code are carried through so the caller can wrap them in
 * whatever error type it already promises.
 */
function rows<T>(result: { data?: unknown; error?: unknown }): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown; code?: unknown };
    throw Object.assign(
      new Error(
        typeof source.message === "string" ? source.message : "database error"
      ),
      { code: typeof source.code === "string" ? source.code : undefined }
    );
  }
  return (result.data ?? []) as T[];
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function createPostgresFeedRepository(
  executor: SqlExecutor
): FeedRepository {
  return {
    backend: "postgres",

    async hydrate({ postIds, authorIds, viewer }) {
      if (postIds.length === 0 && authorIds.length === 0) {
        return { counts: [], profiles: [] };
      }

      const [row] = await executor.query<Record<string, unknown>>(HYDRATE_SQL, [
        JSON.stringify([...new Set(postIds)]),
        JSON.stringify([...new Set(authorIds)]),
        viewer.id,
      ]);

      const counts = toArray<Record<string, unknown>>(row?.counts).map((entry) => ({
        postId: String(entry.post_id),
        likeCount: toNumber(entry.like_count),
        bookmarkCount: toNumber(entry.bookmark_count),
        commentCount: toNumber(entry.comment_count),
        viewerLiked: entry.viewer_liked === true,
        viewerBookmarked: entry.viewer_bookmarked === true,
      }));

      return {
        counts,
        profiles: toArray<FeedAuthorProfile>(row?.profiles),
      };
    },
  };
}

// ── Supabase ─────────────────────────────────────────────────────────

/**
 * The existing behaviour, gathered behind the same interface.
 *
 * Kept so the parity harness can compare like with like, and so the default
 * path is unchanged while the migration is inert. The six calls are the six
 * calls `lib/feedData.ts` makes.
 */
export function createSupabaseFeedRepository(
  supabase: SupabaseClient
): FeedRepository {
  return {
    backend: "supabase",

    async hydrate({ postIds, authorIds, viewer }) {
      const ids = [...new Set(postIds)];
      const authors = [...new Set(authorIds)];
      if (ids.length === 0 && authors.length === 0) {
        return { counts: [], profiles: [] };
      }

      const {
        getBookmarkCountsByPostId,
        getLikeCountsByPostId,
        getVisibleCommentCountsByPostId,
      } = await import("@/lib/postCounts");

      const [
        likeCounts,
        bookmarkCounts,
        commentCounts,
        profiles,
        viewerLikes,
        viewerBookmarks,
      ] = await Promise.all([
        getLikeCountsByPostId(supabase as never, ids),
        getBookmarkCountsByPostId(supabase as never, ids),
        getVisibleCommentCountsByPostId(supabase as never, ids),
        authors.length
          ? supabase
              .from("profiles")
              .select(
                "id, username, full_name, university, avatar_url, verified, verified_type"
              )
              .in("id", authors)
          : Promise.resolve({ data: [] }),
        ids.length && viewer.id
          ? supabase.from("likes").select("post_id").eq("user_id", viewer.id).in("post_id", ids)
          : Promise.resolve({ data: [] }),
        ids.length && viewer.id
          ? supabase
              .from("bookmarks")
              .select("post_id")
              .eq("user_id", viewer.id)
              .in("post_id", ids)
          : Promise.resolve({ data: [] }),
      ]);

      const profileRows = rows<FeedAuthorProfile>(
        profiles as { data?: unknown; error?: unknown }
      );
      const likeRows = rows<{ post_id: string }>(
        viewerLikes as { data?: unknown; error?: unknown }
      );
      const bookmarkRows = rows<{ post_id: string }>(
        viewerBookmarks as { data?: unknown; error?: unknown }
      );

      const likedSet = new Set(likeRows.map((row) => row.post_id));
      const bookmarkedSet = new Set(bookmarkRows.map((row) => row.post_id));

      return {
        counts: ids.map((postId) => ({
          postId,
          likeCount: likeCounts[postId] ?? 0,
          bookmarkCount: bookmarkCounts[postId] ?? 0,
          commentCount: commentCounts[postId] ?? 0,
          viewerLiked: likedSet.has(postId),
          viewerBookmarked: bookmarkedSet.has(postId),
        })),
        profiles: profileRows,
      };
    },
  };
}
