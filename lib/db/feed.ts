import "server-only";

/**
 * The feed's shared reads, as PostgreSQL.
 *
 * ## What is here and why
 *
 * Feed v4 has two deliberately different read shapes:
 *
 * - broad ranking hydration: only the three counters the scorer needs;
 * - narrow rendered-card hydration: counters, author profile and viewer state
 *   only after the visible page has been selected.
 *
 * PostgreSQL answers each shape in one statement. Supabase prefers one bounded
 * RPC per shape and keeps the old PostgREST reads only as migration-lag
 * compatibility.
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
  avatar_url: string | null;
}

export interface FeedHydration {
  counts: FeedPostCounts[];
  profiles: FeedAuthorProfile[];
}

export interface FeedRankingCount {
  postId: string;
  likeCount: number;
  bookmarkCount: number;
  commentCount: number;
}

export interface FeedRepository {
  /** Full card hydration after the feed has selected the posts it will render. */
  hydrate(input: {
    postIds: readonly string[];
    authorIds: readonly string[];
    viewer: FeedViewer;
  }): Promise<FeedHydration>;
  /**
   * Only the global/per-viewer counters the ranking formula needs.
   *
   * Keeping this separate from `hydrate` is deliberate: the first For You
   * page ranks a broad candidate window, but only a small page of those
   * candidates is ever rendered. Pulling author chrome and viewer button state
   * for the whole ranking window was the production fan-out bug.
   */
  rankingCounts(input: {
    postIds: readonly string[];
    viewer: FeedViewer;
  }): Promise<FeedRankingCount[]>;
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
        'avatar_url', p.avatar_url
      ))
      from public.profiles as p
      where p.id in (select id from author_ids)
    ), '[]'::jsonb) as profiles
`;


/**
 * Ranking-only hydration. This intentionally does not touch profiles, viewer
 * likes/bookmarks, or any other card chrome. The broad For You candidate set
 * needs these three counters and nothing else.
 */
const RANKING_COUNTS_SQL = `
  with ids as (
    select value::uuid as id
    from jsonb_array_elements_text($1::text::jsonb) as value
  )
  select
    i.id as post_id,
    coalesce(
      (select lc.like_count from public.post_like_counts lc where lc.post_id = i.id),
      0
    ) as like_count,
    coalesce(
      (select bc.bookmark_count from public.post_bookmark_counts bc where bc.post_id = i.id),
      (select count(*) from public.bookmarks b where b.post_id = i.id),
      0
    ) as bookmark_count,
    (
      select count(*)
      from public.comments c
      where c.post_id = i.id
        and ${commentVisibleSql("c", "$2")}
    ) as comment_count
  from ids i
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

    async rankingCounts({ postIds, viewer }) {
      const ids = [...new Set(postIds)];
      if (ids.length === 0) return [];

      const result = await executor.query<Record<string, unknown>>(
        RANKING_COUNTS_SQL,
        [JSON.stringify(ids), viewer.id]
      );

      return result.map((entry) => ({
        postId: String(entry.post_id),
        likeCount: toNumber(entry.like_count),
        bookmarkCount: toNumber(entry.bookmark_count),
        commentCount: toNumber(entry.comment_count),
      }));
    },
  };
}

// ── Supabase ─────────────────────────────────────────────────────────

/**
 * Supabase implementation. The new RPCs are the normal path; the legacy
 * PostgREST reads remain only so code and database can be deployed in either
 * order without a hard outage.
 */
const missingFeedRpcWarnings = new Set<string>();

function errorCode(error: unknown): string | undefined {
  const source = error as { code?: unknown; cause?: unknown } | null;
  if (typeof source?.code === "string" && source.code) return source.code;
  const cause = source?.cause as { code?: unknown } | null | undefined;
  return typeof cause?.code === "string" && cause.code ? cause.code : undefined;
}

function isMissingRpc(error: unknown): boolean {
  return ["PGRST202", "42883"].includes(errorCode(error) ?? "");
}

function warnMissingRpcOnce(name: string, error: unknown) {
  if (missingFeedRpcWarnings.has(name)) return;
  missingFeedRpcWarnings.add(name);
  console.warn(`[feed] ${name} is not installed yet; using the compatibility path`, error);
}

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

      // Preferred path: one bounded RPC for the posts that actually made the
      // page. It preserves the viewer's RLS because the function is SECURITY
      // INVOKER. The compatibility path below remains for migration lag.
      if (ids.length > 0 && typeof supabase.rpc === "function") {
        const result = await supabase.rpc("hydrate_feed_cards", {
          p_post_ids: ids,
        });
        if (!result.error && Array.isArray(result.data)) {
          const counts: FeedPostCounts[] = [];
          const profilesById = new Map<string, FeedAuthorProfile>();
          for (const row of result.data as Array<Record<string, unknown>>) {
            const postId = typeof row.post_id === "string" ? row.post_id : "";
            if (!postId) continue;
            counts.push({
              postId,
              likeCount: toNumber(row.like_count),
              bookmarkCount: toNumber(row.bookmark_count),
              commentCount: toNumber(row.comment_count),
              viewerLiked: row.viewer_liked === true,
              viewerBookmarked: row.viewer_bookmarked === true,
            });
            const authorId = typeof row.author_id === "string" ? row.author_id : "";
            const username = typeof row.username === "string" ? row.username : "";
            if (authorId && username && !profilesById.has(authorId)) {
              profilesById.set(authorId, {
                id: authorId,
                username,
                full_name: typeof row.full_name === "string" ? row.full_name : null,
                avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
              });
            }
          }
          return { counts, profiles: [...profilesById.values()] };
        }
        if (result.error && isMissingRpc(result.error)) {
          warnMissingRpcOnce("hydrate_feed_cards", result.error);
        } else if (result.error) {
          console.warn(
            "[feed-hydration] hydrate_feed_cards unavailable; skipping optional card decoration",
            result.error
          );
          return { counts: [], profiles: [] };
        }
      }

      const {
        getBookmarkCountsByPostId,
        getLikeCountsByPostId,
        getVisibleCommentCountsByPostId,
      } = await import("@/lib/postCounts");

      // Hydration is decoration around an already-successful post list. A
      // timeout loading likes, bookmarks, comment counts or author chrome must
      // not turn twelve perfectly readable posts into "Couldn't load your
      // feed". Each optional branch therefore fails soft and the card falls
      // back to zero/false/null for that field. The primary list query remains
      // strict in feedList.ts, so a real failure to load posts still surfaces.
      //
      // This also matters during a Supabase incident: the old Promise.all made
      // the first rejected aggregate reject the entire hydration wave. Worse,
      // postCounts then tried a raw-row fallback after some gateway failures,
      // adding more pressure while the service was already timing out.
      const loadProfiles = async () =>
        authors.length
          ? rows<FeedAuthorProfile>(
              (await supabase
                .from("profiles")
                .select(
                  "id, username, full_name, avatar_url"
                )
                .in("id", authors)) as { data?: unknown; error?: unknown }
            )
          : [];

      const loadViewerLikes = async () =>
        ids.length && viewer.id
          ? rows<{ post_id: string }>(
              (await supabase
                .from("likes")
                .select("post_id")
                .eq("user_id", viewer.id)
                .in("post_id", ids)) as { data?: unknown; error?: unknown }
            )
          : [];

      const loadViewerBookmarks = async () =>
        ids.length && viewer.id
          ? rows<{ post_id: string }>(
              (await supabase
                .from("bookmarks")
                .select("post_id")
                .eq("user_id", viewer.id)
                .in("post_id", ids)) as { data?: unknown; error?: unknown }
            )
          : [];

      const [
        likeCountsResult,
        bookmarkCountsResult,
        commentCountsResult,
        profilesResult,
        viewerLikesResult,
        viewerBookmarksResult,
      ] = await Promise.allSettled([
        getLikeCountsByPostId(supabase as never, ids),
        getBookmarkCountsByPostId(supabase as never, ids),
        getVisibleCommentCountsByPostId(supabase as never, ids),
        loadProfiles(),
        loadViewerLikes(),
        loadViewerBookmarks(),
      ] as const);

      function valueOr<T>(
        result: PromiseSettledResult<T>,
        label: string,
        fallback: T
      ): T {
        if (result.status === "fulfilled") return result.value;
        console.warn(
          `[feed-hydration] ${label} unavailable; rendering cards without it`,
          result.reason
        );
        return fallback;
      }

      const likeCounts = valueOr(likeCountsResult, "like counts", {});
      const bookmarkCounts = valueOr(
        bookmarkCountsResult,
        "bookmark counts",
        {}
      );
      const commentCounts = valueOr(commentCountsResult, "comment counts", {});
      const profileRows = valueOr(profilesResult, "author profiles", []);
      const likeRows = valueOr(viewerLikesResult, "viewer likes", []);
      const bookmarkRows = valueOr(
        viewerBookmarksResult,
        "viewer bookmarks",
        []
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

    async rankingCounts({ postIds }) {
      const ids = [...new Set(postIds)];
      if (ids.length === 0) return [];

      // The new RPC sends the candidate ids in the request body instead of
      // building several very large `in.(...)` URLs. It also executes the
      // three ranking counters next to the data in one statement.
      if (typeof supabase.rpc === "function") {
        const result = await supabase.rpc("get_feed_ranking_metrics", {
          p_post_ids: ids,
        });
        if (!result.error && Array.isArray(result.data)) {
          return (result.data as Array<Record<string, unknown>>)
            .map((row) => ({
              postId: typeof row.post_id === "string" ? row.post_id : "",
              likeCount: toNumber(row.like_count),
              bookmarkCount: toNumber(row.bookmark_count),
              commentCount: toNumber(row.comment_count),
            }))
            .filter((row) => Boolean(row.postId));
        }
        if (result.error && isMissingRpc(result.error)) {
          warnMissingRpcOnce("get_feed_ranking_metrics", result.error);
        } else if (result.error) {
          console.warn(
            "[feed-ranking] get_feed_ranking_metrics unavailable; ranking with zero counters",
            result.error
          );
          return ids.map((postId) => ({
            postId,
            likeCount: 0,
            bookmarkCount: 0,
            commentCount: 0,
          }));
        }
      }

      // Compatibility path while the migration is being applied. Only the
      // three ranking counters are requested; author chrome and viewer button
      // state are intentionally deferred until after the top page is selected.
      const {
        getBookmarkCountsByPostId,
        getLikeCountsByPostId,
        getVisibleCommentCountsByPostId,
      } = await import("@/lib/postCounts");

      const [likes, bookmarks, comments] = await Promise.allSettled([
        getLikeCountsByPostId(supabase as never, ids),
        getBookmarkCountsByPostId(supabase as never, ids),
        getVisibleCommentCountsByPostId(supabase as never, ids),
      ]);

      const read = (
        result: PromiseSettledResult<Record<string, number>>,
        label: string
      ): Record<string, number> => {
        if (result.status === "fulfilled") return result.value;
        console.warn(`[feed-ranking] ${label} unavailable; ranking with zeroes`, result.reason);
        return {};
      };

      const likeCounts = read(likes, "like counts");
      const bookmarkCounts = read(bookmarks, "bookmark counts");
      const commentCounts = read(comments, "comment counts");
      return ids.map((postId) => ({
        postId,
        likeCount: likeCounts[postId] ?? 0,
        bookmarkCount: bookmarkCounts[postId] ?? 0,
        commentCount: commentCounts[postId] ?? 0,
      }));
    },
  };
}
