import "server-only";

/**
 * The feed's shared reads, as PostgreSQL.
 *
 * ## What is here and why
 *
 * `lib/feedData.ts` hydrates every list of posts the same way: given some post
 * ids and their author ids, fetch six aggregates, the author profiles, the
 * accepted co-authors, and the viewer's own likes and bookmarks. That is nine
 * PostgREST round trips, and it runs for the home feed, the landing page, the
 * response list under a post, and every other list of cards.
 *
 * One statement replaces all nine. It is the highest-leverage query in the
 * application: the same function serves the feed and the post page's
 * responses, so migrating it removes the post page's last public PostgREST
 * dependency at the same time.
 *
 * ## The count semantics are not obvious and are preserved exactly
 *
 * - `like_count` comes from `post_like_counts` and has **no** row-count
 *   fallback. `posts.like_count` was dropped in 20260715000004 and the
 *   aggregate has been authoritative since; counting `likes` here would be a
 *   different number, not a safer one.
 * - `bookmark_count` and `reference_count` come from their aggregate tables
 *   and **do** fall back to counting rows, which is what
 *   `readAggregateCounts` does when the aggregate table has no row yet. The
 *   fallback is a `coalesce` here rather than a second round trip.
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
  referenceCount: number;
  commentCount: number;
  responseCount: number;
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

export interface FeedCoAuthor {
  post_id: string;
  user_id: string;
  display_order: number | null;
}

export interface NamedProfile {
  id: string;
  username: string;
  full_name: string | null;
}

export interface FeedParentPost {
  id: string;
  slug: string;
  title: string | null;
  type: string;
  content_kind: string | null;
  author_id: string;
}

export interface FeedResponseContext {
  coAuthorProfiles: NamedProfile[];
  parentPosts: FeedParentPost[];
  parentAuthorProfiles: NamedProfile[];
}

export interface FeedHydration {
  counts: FeedPostCounts[];
  profiles: FeedAuthorProfile[];
  coAuthors: FeedCoAuthor[];
}

export interface FeedRepository {
  /** Nine PostgREST round trips in one statement. */
  hydrate(input: {
    postIds: readonly string[];
    authorIds: readonly string[];
    viewer: FeedViewer;
  }): Promise<FeedHydration>;
  /**
   * The published responses to one post, newest first.
   *
   * Ordered by published_at then id, both descending. The id is not
   * decoration: two responses published in the same second would otherwise
   * come back in an order the database is free to change between requests,
   * and the page numbers them.
   */
  /**
   * The three follow-up reads a card list needs: the names of accepted
   * co-authors, the parent of any card that is itself a response, and that
   * parent's author.
   *
   * They were three sequential PostgREST calls, and sequential because the
   * third depends on the second. One statement with a CTE removes both the
   * round trips and the dependency.
   */
  responseContext(input: {
    coAuthorIds: readonly string[];
    parentIds: readonly string[];
    excludedAuthorIds: readonly string[];
  }): Promise<FeedResponseContext>;
  responsePosts(input: {
    parentId: string;
    limit: number;
    excludedType: string;
  }): Promise<Array<Record<string, unknown>>>;
  readonly backend: "supabase" | "postgres";
}

// ── PostgreSQL ───────────────────────────────────────────────────────

/**
 * One statement, three result columns.
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
        'reference_count', coalesce(
          (select rc.reference_count from public.post_reference_counts rc where rc.post_id = i.id),
          (select count(*) from public.post_references r where r.post_id = i.id)
        ),

        -- The RLS SELECT policy on comments, shared with the comment thread
        -- so the feed's count and the thread's list cannot disagree about
        -- what a visible comment is. See lib/db/commentVisibility.ts.
        'comment_count', (
          select count(*) from public.comments c
          where c.post_id = i.id
            and ${commentVisibleSql("c", "$3")}
        ),

        'response_count', (
          select count(*) from public.posts p
          where p.in_response_to = i.id and p.status = 'published'
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
    ), '[]'::jsonb) as profiles,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'post_id', a.post_id,
        'user_id', a.user_id,
        'display_order', a.display_order
      ) order by a.display_order asc nulls last)
      from public.post_authors as a
      where a.post_id in (select id from ids)
        and a.accepted_at is not null
    ), '[]'::jsonb) as co_authors
`;

/**
 * The response list under a post.
 *
 * `tags` is selected as jsonb for the reason every array column in this
 * migration is: under `fetch_types: false` a bare text[] arrives as the
 * string {a,b} and the first .map() in a component throws.
 */
/**
 * Co-author names, response parents, and those parents' authors.
 *
 * The parent authors depend on which parents came back, which is why this was
 * three round trips rather than two. A CTE expresses the dependency without
 * paying for it.
 *
 * Parameters:
 *   $1 co-author ids (json array)
 *   $2 parent post ids (json array)
 *   $3 excluded author ids (json array)
 */
const RESPONSE_CONTEXT_SQL = `
  with parents as (
    select p.id, p.slug, p.title, p.type, p.content_kind, p.author_id
    from public.posts as p
    where p.id in (
      select value::uuid from jsonb_array_elements_text($2::text::jsonb) as value
    )
      and p.status = 'published'
      and p.author_id not in (
        select value::uuid from jsonb_array_elements_text($3::text::jsonb) as value
      )
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'username', c.username, 'full_name', c.full_name
      ))
      from public.profiles as c
      where c.id in (
        select value::uuid from jsonb_array_elements_text($1::text::jsonb) as value
      )
    ), '[]'::jsonb) as co_author_profiles,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'slug', p.slug, 'title', p.title,
        'type', p.type, 'content_kind', p.content_kind, 'author_id', p.author_id
      ))
      from parents as p
    ), '[]'::jsonb) as parent_posts,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'username', a.username, 'full_name', a.full_name
      ))
      from public.profiles as a
      where a.id in (select author_id from parents)
    ), '[]'::jsonb) as parent_author_profiles
`;

const RESPONSE_POSTS_SQL = `
  select
    p.id, p.title, p.slug, p.in_response_to, p.excerpt, p.type,
    p.content_kind, p.article_format, to_jsonb(p.tags) as tags,
    p.created_at, p.published_at, p.view_count, p.impression_count,
    p.read_count, p.word_count, p.cover_image_url, p.citation_id,
    p.published_version_id, p.document_original_name, p.document_mime_type,
    p.document_size_bytes, p.author_id
  from public.posts as p
  where p.in_response_to = $1::uuid
    and p.status = 'published'
    and p.type <> $2::text
  order by p.published_at desc nulls last, p.id desc
  limit $3::int
`;

/**
 * A database error is an error, not an empty list.
 *
 * The PostgREST calls this replaced went through `expectRows`, which threw on
 * `result.error`. Reading `.data` and ignoring `.error` would turn an outage
 * into a post with no responses and a feed with no cards, reported as success:
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
        return { counts: [], profiles: [], coAuthors: [] };
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
        referenceCount: toNumber(entry.reference_count),
        commentCount: toNumber(entry.comment_count),
        responseCount: toNumber(entry.response_count),
        viewerLiked: entry.viewer_liked === true,
        viewerBookmarked: entry.viewer_bookmarked === true,
      }));

      return {
        counts,
        profiles: toArray<FeedAuthorProfile>(row?.profiles),
        coAuthors: toArray<FeedCoAuthor>(row?.co_authors),
      };
    },

    async responseContext({ coAuthorIds, parentIds, excludedAuthorIds }) {
      if (coAuthorIds.length === 0 && parentIds.length === 0) {
        return { coAuthorProfiles: [], parentPosts: [], parentAuthorProfiles: [] };
      }

      const [row] = await executor.query<Record<string, unknown>>(
        RESPONSE_CONTEXT_SQL,
        [
          JSON.stringify([...new Set(coAuthorIds)]),
          JSON.stringify([...new Set(parentIds)]),
          // `not in` against an empty set is true for every row, which is what
          // "no exclusions" has to mean. A NULL in the list would make it
          // false for all of them, so the array is deliberately never null.
          JSON.stringify([...new Set(excludedAuthorIds)]),
        ]
      );

      return {
        coAuthorProfiles: toArray<NamedProfile>(row?.co_author_profiles),
        parentPosts: toArray<FeedParentPost>(row?.parent_posts),
        parentAuthorProfiles: toArray<NamedProfile>(row?.parent_author_profiles),
      };
    },

    async responsePosts({ parentId, limit, excludedType }) {
      const rows = await executor.query<Record<string, unknown>>(
        RESPONSE_POSTS_SQL,
        [parentId, excludedType, limit]
      );

      // Timestamps come back as Date objects and the cards expect the strings
      // PostgREST produced.
      return rows.map((row) => ({
        ...row,
        created_at:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : row.created_at,
        published_at:
          row.published_at instanceof Date
            ? row.published_at.toISOString()
            : row.published_at,
      }));
    },
  };
}

// ── Supabase ─────────────────────────────────────────────────────────

/**
 * The existing behaviour, gathered behind the same interface.
 *
 * Kept so the parity harness can compare like with like, and so the default
 * path is unchanged while the migration is inert. The nine calls are the nine
 * calls `lib/feedData.ts` already makes.
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
        return { counts: [], profiles: [], coAuthors: [] };
      }

      const {
        getBookmarkCountsByPostId,
        getLikeCountsByPostId,
        getReferenceCountsByPostId,
        getVisibleCommentCountsByPostId,
      } = await import("@/lib/postCounts");

      const [
        likeCounts,
        bookmarkCounts,
        referenceCounts,
        commentCounts,
        responses,
        profiles,
        coAuthors,
        viewerLikes,
        viewerBookmarks,
      ] = await Promise.all([
        getLikeCountsByPostId(supabase as never, ids),
        getBookmarkCountsByPostId(supabase as never, ids),
        getReferenceCountsByPostId(supabase as never, ids),
        getVisibleCommentCountsByPostId(supabase as never, ids),
        ids.length
          ? supabase
              .from("posts")
              .select("in_response_to")
              .in("in_response_to", ids)
              .eq("status", "published")
          : Promise.resolve({ data: [] }),
        authors.length
          ? supabase
              .from("profiles")
              .select(
                "id, username, full_name, university, avatar_url, verified, verified_type"
              )
              .in("id", authors)
          : Promise.resolve({ data: [] }),
        ids.length
          ? supabase
              .from("post_authors")
              .select("post_id, user_id, display_order")
              .in("post_id", ids)
              .not("accepted_at", "is", null)
              .order("display_order", { ascending: true })
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

      const responseRows = rows<{ in_response_to?: string | null }>(
        responses as { data?: unknown; error?: unknown }
      );
      const profileRows = rows<FeedAuthorProfile>(
        profiles as { data?: unknown; error?: unknown }
      );
      const coAuthorRows = rows<FeedCoAuthor>(
        coAuthors as { data?: unknown; error?: unknown }
      );
      const likeRows = rows<{ post_id: string }>(
        viewerLikes as { data?: unknown; error?: unknown }
      );
      const bookmarkRows = rows<{ post_id: string }>(
        viewerBookmarks as { data?: unknown; error?: unknown }
      );

      const responseCounts = new Map<string, number>();
      for (const row of responseRows) {
        const parent = row.in_response_to;
        if (parent) responseCounts.set(parent, (responseCounts.get(parent) ?? 0) + 1);
      }

      const likedSet = new Set(likeRows.map((row) => row.post_id));
      const bookmarkedSet = new Set(bookmarkRows.map((row) => row.post_id));

      return {
        counts: ids.map((postId) => ({
          postId,
          likeCount: likeCounts[postId] ?? 0,
          bookmarkCount: bookmarkCounts[postId] ?? 0,
          referenceCount: referenceCounts[postId] ?? 0,
          commentCount: commentCounts[postId] ?? 0,
          responseCount: responseCounts.get(postId) ?? 0,
          viewerLiked: likedSet.has(postId),
          viewerBookmarked: bookmarkedSet.has(postId),
        })),
        profiles: profileRows,
        coAuthors: coAuthorRows,
      };
    },

    async responseContext({ coAuthorIds, parentIds, excludedAuthorIds }) {
      const coIds = [...new Set(coAuthorIds)];
      const pIds = [...new Set(parentIds)];

      const coAuthorProfiles = coIds.length
        ? rows<NamedProfile>(
            await supabase.from("profiles").select("id, username, full_name").in("id", coIds)
          )
        : [];

      let parentQuery = pIds.length
        ? supabase
            .from("posts")
            .select("id, slug, title, type, content_kind, author_id")
            .in("id", pIds)
            .eq("status", "published")
        : null;
      if (parentQuery && excludedAuthorIds.length > 0) {
        parentQuery = parentQuery.not(
          "author_id",
          "in",
          `(${[...new Set(excludedAuthorIds)].join(",")})`
        );
      }
      const parentPosts = parentQuery
        ? rows<FeedParentPost>(await parentQuery)
        : [];

      const parentAuthorIds = [
        ...new Set(parentPosts.map((p) => p.author_id).filter(Boolean)),
      ];
      const parentAuthorProfiles = parentAuthorIds.length
        ? rows<NamedProfile>(
            await supabase
              .from("profiles")
              .select("id, username, full_name")
              .in("id", parentAuthorIds)
          )
        : [];

      return { coAuthorProfiles, parentPosts, parentAuthorProfiles };
    },

    async responsePosts({ parentId, limit, excludedType }) {
      const result = await supabase
        .from("posts")
        .select(
          "id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, created_at, published_at, view_count, impression_count, read_count, word_count, cover_image_url, citation_id, published_version_id, document_original_name, document_mime_type, document_size_bytes, author_id"
        )
        .eq("in_response_to", parentId)
        .eq("status", "published")
        .neq("type", excludedType)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);

      return rows<Record<string, unknown>>(result);
    },
  };
}
