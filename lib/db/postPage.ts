import "server-only";

/**
 * Everything the post page reads besides the post itself.
 *
 * ## Why this exists
 *
 * The page made roughly seventeen PostgREST round trips, one of which
 * (`getPostBySlug`) already went through `lib/db`. The other sixteen went to
 * Supabase's gateway, so a gateway failure left the page hanging even though
 * the core post had been fetched.
 *
 * These read the same production database, through PostgreSQL directly rather
 * than through PostgREST. That is the whole point of this stage: no second
 * database, no staleness, no split brain, and every migrated read becomes
 * portable to Neon later by changing a connection string.
 *
 * ## Bounded, not one-for-one
 *
 * Fifteen PostgREST calls become four statements. The counts are one row of
 * scalar subqueries; the child collections are one row of `jsonb_agg`s; the
 * neighbours are one `UNION ALL`. Reproducing fifteen separate round trips in
 * SQL would move the failure and keep the latency.
 *
 * ## What this does not do
 *
 * It does not protect against the database being down. It removes PostgREST
 * from the path for these reads, which is a gateway-shaped failure, and that
 * is all. Removing the database as a single point of failure is the Neon
 * cutover, and this is not it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface PostPageCounts {
  likeCount: number;
  bookmarkCount: number;
  commentCount: number;
  responseCount: number;
}

export interface PostReferenceRow {
  id: string;
  post_id: string;
  display_order: number | null;
  title: string | null;
  source: string | null;
  authors: string | null;
  url: string | null;
  doi: string | null;
  raw: string | null;
  year: number | null;
  ref_type: string | null;
}

export interface CoAuthorRow {
  user_id: string;
  display_order: number | null;
  corresponding_author: boolean | null;
  accepted_at: string | null;
  profile: { username: string; full_name: string | null } | null;
}

export interface ReviewRow {
  assigned_at: string | null;
  submitted_at: string | null;
  recommendation: string | null;
  round: number | null;
}

export interface EditorDecisionRow {
  decision: string | null;
  created_at: string | null;
  round: number | null;
}

export interface VersionRow {
  id: string;
  version_kind: string | null;
  round: number | null;
  created_at: string | null;
}

export interface NeighbourPost {
  id: string;
  title: string | null;
  slug: string;
}

export interface RelatedPost {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  published_at: string | null;
  created_at: string;
  cover_image_url: string | null;
  profiles: { full_name: string | null; username: string } | null;
}

export interface PostPageCollections {
  references: PostReferenceRow[];
  coAuthors: CoAuthorRow[];
  reviews: ReviewRow[];
  decisions: EditorDecisionRow[];
  versions: VersionRow[];
}

export interface ParentPost {
  id: string;
  title: string | null;
  slug: string;
  content_kind: string | null;
  type: string;
  profiles: { full_name: string | null; username: string } | null;
}

export interface PostPageViewerState {
  liked: boolean;
  bookmarked: boolean;
  following: boolean;
  subscribed: boolean;
}

export interface PostPageRepository {
  counts(postId: string): Promise<PostPageCounts>;
  collections(postId: string): Promise<PostPageCollections>;
  related(
    postId: string,
    tags: readonly string[],
    limit: number
  ): Promise<RelatedPost[]>;
  neighbours(
    postId: string,
    publishedAt: string
  ): Promise<{ previous: NeighbourPost | null; next: NeighbourPost | null }>;
  /** The published post a response was written about, for the banner above
   *  it. Public: a response page shows it to everybody. */
  parentPost(parentPostId: string): Promise<ParentPost | null>;
  /** Authenticated only. The viewer id comes from the server, never from the
   *  request body: these are the four booleans that decide whether the page
   *  shows "liked" and "following", and a caller-supplied id would let anybody
   *  read anybody's. */
  viewerState(
    postId: string,
    viewerId: string,
    authorId: string | null
  ): Promise<PostPageViewerState>;
  readonly backend: "supabase" | "postgres";
}

// ── Supabase (the existing behaviour, gathered in one place) ─────────

export function createSupabasePostPageRepository(
  supabase: SupabaseClient
): PostPageRepository {
  return {
    backend: "supabase",

    async counts(postId) {
      const [likes, bookmarks, comments, responses] = await Promise.all([
        supabase.from("likes").select("*", { count: "exact", head: true }).eq("post_id", postId),
        supabase.from("bookmarks").select("*", { count: "exact", head: true }).eq("post_id", postId),
        supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
        supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("in_response_to", postId)
          .eq("status", "published"),
      ]);

      return {
        likeCount: likes.count ?? 0,
        bookmarkCount: bookmarks.count ?? 0,
        commentCount: comments.count ?? 0,
        responseCount: responses.count ?? 0,
      };
    },

    async collections(postId) {
      const [references, coAuthors, reviews, decisions, versions] = await Promise.all([
        supabase
          .from("post_references")
          .select("*")
          .eq("post_id", postId)
          .order("display_order", { ascending: true }),
        supabase
          .from("post_authors")
          .select(
            "user_id, display_order, corresponding_author, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name)"
          )
          .eq("post_id", postId)
          .not("accepted_at", "is", null)
          .order("display_order", { ascending: true }),
        supabase
          .from("post_reviews")
          .select("assigned_at, submitted_at, recommendation, round")
          .eq("post_id", postId)
          .is("removed_at", null),
        supabase
          .from("post_editor_decisions")
          .select("decision, created_at, round")
          .eq("post_id", postId)
          .order("created_at", { ascending: false }),
        supabase
          .from("post_versions")
          .select("id, version_kind, round, created_at")
          .eq("post_id", postId)
          .order("created_at", { ascending: true }),
      ]);

      const firstProfile = (value: unknown) =>
        Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

      return {
        references: (references.data ?? []) as PostReferenceRow[],
        coAuthors: ((coAuthors.data ?? []) as Array<Record<string, unknown>>).map(
          (row) => ({
            ...(row as unknown as CoAuthorRow),
            profile: firstProfile(row.profile) as CoAuthorRow["profile"],
          })
        ),
        reviews: (reviews.data ?? []) as ReviewRow[],
        decisions: (decisions.data ?? []) as EditorDecisionRow[],
        versions: (versions.data ?? []) as VersionRow[],
      };
    },

    async related(postId, tags, limit) {
      if (tags.length === 0) return [];
      const { data } = await supabase
        .from("posts")
        .select(
          "id, title, slug, type, content_kind, article_format, published_at, created_at, cover_image_url, profiles!posts_author_id_fkey (full_name, username)"
        )
        .eq("status", "published")
        .neq("id", postId)
        .overlaps("tags", tags as string[])
        .order("published_at", { ascending: false })
        .limit(limit);

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as unknown as RelatedPost),
        profiles: (Array.isArray(row.profiles)
          ? (row.profiles[0] ?? null)
          : (row.profiles ?? null)) as RelatedPost["profiles"],
      }));
    },

    async neighbours(postId, publishedAt) {
      const [previous, next] = await Promise.all([
        supabase
          .from("posts")
          .select("id, title, slug")
          .eq("status", "published")
          .neq("id", postId)
          .lt("published_at", publishedAt)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("posts")
          .select("id, title, slug")
          .eq("status", "published")
          .neq("id", postId)
          .gt("published_at", publishedAt)
          .order("published_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      return {
        previous: (previous.data as NeighbourPost | null) ?? null,
        next: (next.data as NeighbourPost | null) ?? null,
      };
    },

    async parentPost(parentPostId) {
      const { data } = await supabase
        .from("posts")
        .select(
          "id, title, slug, content_kind, type, profiles!posts_author_id_fkey (full_name, username)"
        )
        .eq("id", parentPostId)
        .eq("status", "published")
        .maybeSingle();

      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        ...(row as unknown as ParentPost),
        profiles: (Array.isArray(row.profiles)
          ? (row.profiles[0] ?? null)
          : (row.profiles ?? null)) as ParentPost["profiles"],
      };
    },

    async viewerState(postId, viewerId, authorId) {
      const [like, bookmark, follow, subscription] = await Promise.all([
        supabase
          .from("likes")
          .select("user_id")
          .eq("post_id", postId)
          .eq("user_id", viewerId)
          .maybeSingle(),
        supabase
          .from("bookmarks")
          .select("user_id")
          .eq("post_id", postId)
          .eq("user_id", viewerId)
          .maybeSingle(),
        authorId
          ? supabase
              .from("follows")
              .select("follower_id")
              .eq("follower_id", viewerId)
              .eq("following_id", authorId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        authorId
          ? supabase
              .from("author_subscriptions")
              .select("subscriber_id")
              .eq("subscriber_id", viewerId)
              .eq("author_id", authorId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        liked: Boolean(like.data),
        bookmarked: Boolean(bookmark.data),
        following: Boolean(follow.data),
        subscribed: Boolean(subscription.data),
      };
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

/**
 * Counts, as one row of scalar subqueries.
 *
 * PostgREST spends a round trip per `count: exact, head: true`. Postgres does
 * not need four connections to count four things.
 */
const COUNTS_SQL = `
  select
    (select count(*) from public.likes where post_id = $1::uuid) as like_count,
    (select count(*) from public.bookmarks where post_id = $1::uuid) as bookmark_count,
    (select count(*) from public.comments where post_id = $1::uuid) as comment_count,
    (select count(*) from public.posts
      where in_response_to = $1::uuid and status = 'published') as response_count
`;

/**
 * The five child collections, as one row of jsonb aggregates.
 *
 * `jsonb_agg` rather than a join: five collections in one result set would be
 * a cross product, and the page wants five lists, not one denormalised table.
 * Each aggregate carries its own ORDER BY, which is where PostgREST's
 * `.order()` went. `coalesce` to `[]` because `jsonb_agg` over no rows is NULL
 * and every caller here expects an array it can map.
 */
const COLLECTIONS_SQL = `
  select
    coalesce((
      select jsonb_agg(to_jsonb(r) order by r.display_order asc nulls last)
      from public.post_references as r
      where r.post_id = $1::uuid
    ), '[]'::jsonb) as references,

    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', a.user_id,
          'display_order', a.display_order,
          'corresponding_author', a.corresponding_author,
          'accepted_at', a.accepted_at,
          'profile', case when p.id is null then null else jsonb_build_object(
            'username', p.username,
            'full_name', p.full_name
          ) end
        ) order by a.display_order asc nulls last
      )
      from public.post_authors as a
      left join public.profiles as p on p.id = a.user_id
      where a.post_id = $1::uuid and a.accepted_at is not null
    ), '[]'::jsonb) as co_authors,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'assigned_at', v.assigned_at,
        'submitted_at', v.submitted_at,
        'recommendation', v.recommendation,
        'round', v.round
      ))
      from public.post_reviews as v
      where v.post_id = $1::uuid and v.removed_at is null
    ), '[]'::jsonb) as reviews,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'decision', d.decision,
        'created_at', d.created_at,
        'round', d.round
      ) order by d.created_at desc)
      from public.post_editor_decisions as d
      where d.post_id = $1::uuid
    ), '[]'::jsonb) as decisions,

    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'version_kind', s.version_kind,
        'round', s.round,
        'created_at', s.created_at
      ) order by s.created_at asc)
      from public.post_versions as s
      where s.post_id = $1::uuid
    ), '[]'::jsonb) as versions
`;

/**
 * Related posts, by tag overlap.
 *
 * The tag array arrives as jsonb and is converted in SQL, for the reason
 * lib/db/postWrites.ts documents: `fetch_types: false` means the driver
 * cannot serialise an array parameter, and `$n::jsonb` makes it double-encode
 * an already-serialised one. `$n::text::jsonb` is the shape that survives.
 */
const RELATED_SQL = `
  select
    p.id, p.title, p.slug, p.type, p.content_kind, p.article_format,
    p.published_at, p.created_at, p.cover_image_url,
    case when author.id is null then null else jsonb_build_object(
      'full_name', author.full_name,
      'username', author.username
    ) end as profiles
  from public.posts as p
  left join public.profiles as author on author.id = p.author_id
  where p.status = 'published'
    and p.id <> $1::uuid
    and p.tags && ARRAY(select jsonb_array_elements_text($2::text::jsonb))
  order by p.published_at desc nulls last
  limit $3::int
`;

/**
 * The previous and next published post, in one statement.
 *
 * Two `maybeSingle()` round trips become one `UNION ALL`. The discriminator is
 * a literal rather than a computed column so neither branch can be mistaken
 * for the other when one of them returns nothing.
 */
const NEIGHBOURS_SQL = `
  (
    select 'previous' as direction, p.id, p.title, p.slug
    from public.posts as p
    where p.status = 'published' and p.id <> $1::uuid
      and p.published_at < $2::timestamptz
    order by p.published_at desc
    limit 1
  )
  union all
  (
    select 'next' as direction, p.id, p.title, p.slug
    from public.posts as p
    where p.status = 'published' and p.id <> $1::uuid
      and p.published_at > $2::timestamptz
    order by p.published_at asc
    limit 1
  )
`;

/**
 * The viewer's relationship to this post and its author.
 *
 * Four `maybeSingle()` lookups become four `exists` in one row. The viewer id
 * is a parameter the server resolved; there is no `auth.uid()` here and there
 * cannot be, because a direct connection has none.
 */
const VIEWER_STATE_SQL = `
  select
    exists(select 1 from public.likes
            where post_id = $1::uuid and user_id = $2::uuid) as liked,
    exists(select 1 from public.bookmarks
            where post_id = $1::uuid and user_id = $2::uuid) as bookmarked,
    case when $3::uuid is null then false else exists(
      select 1 from public.follows
        where follower_id = $2::uuid and following_id = $3::uuid) end as following,
    case when $3::uuid is null then false else exists(
      select 1 from public.author_subscriptions
        where subscriber_id = $2::uuid and author_id = $3::uuid) end as subscribed
`;

/** The parent of a response. Published only: an unpublished parent must not
 *  be named on a public page. */
const PARENT_POST_SQL = `
  select
    p.id, p.title, p.slug, p.content_kind, p.type,
    case when author.id is null then null else jsonb_build_object(
      'full_name', author.full_name,
      'username', author.username
    ) end as profiles
  from public.posts as p
  left join public.profiles as author on author.id = p.author_id
  where p.id = $1::uuid and p.status = 'published'
  limit 1
`;

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** jsonb comes back parsed from postgres.js; a `json` column or an untyped
 *  driver would hand over a string. Both are accepted. */
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

export function createPostgresPostPageRepository(
  executor: SqlExecutor
): PostPageRepository {
  return {
    backend: "postgres",

    async counts(postId) {
      const [row] = await executor.query<Record<string, unknown>>(COUNTS_SQL, [postId]);
      return {
        likeCount: toNumber(row?.like_count),
        bookmarkCount: toNumber(row?.bookmark_count),
        commentCount: toNumber(row?.comment_count),
        responseCount: toNumber(row?.response_count),
      };
    },

    async collections(postId) {
      const [row] = await executor.query<Record<string, unknown>>(COLLECTIONS_SQL, [
        postId,
      ]);
      return {
        references: toArray<PostReferenceRow>(row?.references),
        coAuthors: toArray<CoAuthorRow>(row?.co_authors),
        reviews: toArray<ReviewRow>(row?.reviews),
        decisions: toArray<EditorDecisionRow>(row?.decisions),
        versions: toArray<VersionRow>(row?.versions),
      };
    },

    async related(postId, tags, limit) {
      if (tags.length === 0) return [];
      const rows = await executor.query<Record<string, unknown>>(RELATED_SQL, [
        postId,
        JSON.stringify(tags),
        limit,
      ]);

      return rows.map((row) => ({
        id: String(row.id),
        title: (row.title as string | null) ?? null,
        slug: String(row.slug),
        type: String(row.type),
        content_kind: (row.content_kind as string | null) ?? null,
        article_format: (row.article_format as string | null) ?? null,
        published_at: toIso(row.published_at),
        created_at: toIso(row.created_at) ?? "",
        cover_image_url: (row.cover_image_url as string | null) ?? null,
        profiles: (row.profiles ?? null) as RelatedPost["profiles"],
      }));
    },

    async neighbours(postId, publishedAt) {
      const rows = await executor.query<Record<string, unknown>>(NEIGHBOURS_SQL, [
        postId,
        publishedAt,
      ]);

      const pick = (direction: string): NeighbourPost | null => {
        const row = rows.find((entry) => entry.direction === direction);
        if (!row) return null;
        return {
          id: String(row.id),
          title: (row.title as string | null) ?? null,
          slug: String(row.slug),
        };
      };

      return { previous: pick("previous"), next: pick("next") };
    },

    async parentPost(parentPostId) {
      const [row] = await executor.query<Record<string, unknown>>(PARENT_POST_SQL, [
        parentPostId,
      ]);
      if (!row) return null;
      return {
        id: String(row.id),
        title: (row.title as string | null) ?? null,
        slug: String(row.slug),
        content_kind: (row.content_kind as string | null) ?? null,
        type: String(row.type),
        profiles: (row.profiles ?? null) as ParentPost["profiles"],
      };
    },

    async viewerState(postId, viewerId, authorId) {
      const [row] = await executor.query<Record<string, unknown>>(VIEWER_STATE_SQL, [
        postId,
        viewerId,
        authorId,
      ]);

      return {
        liked: row?.liked === true,
        bookmarked: row?.bookmarked === true,
        following: row?.following === true,
        subscribed: row?.subscribed === true,
      };
    },
  };
}
