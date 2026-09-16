import "server-only";

/**
 * The public profile page's reads, as PostgreSQL and as PostgREST.
 *
 * The identity row lives in `lib/db/supabase/profiles.ts` and its PostgreSQL
 * twin. This is everything else the page loads: the relationship counts, the
 * viewer's relationship to the profile, and the Posts and Articles lists.
 *
 * Same production database, not Neon. What changes on the direct path is that
 * these stop travelling through the gateway.
 *
 * ## Where faithful is not the same as tidy
 *
 * **The publication pagination is quirky and is reproduced quirk and all.**
 * The owned branch is offset-paginated; the co-authored branch takes
 * `start + pageSize + 1` rows from the top and is then merged and re-sorted in
 * TypeScript. That means page two is an approximation rather than a clean
 * continuation. It is what the profile has always shown, so this returns the
 * same two branches with the same bounds and leaves the merge where it was.
 * Replacing it with a correct UNION would change which posts appear on page
 * two, which is a product change wearing a refactor's clothes.
 *
 * The publishing reset, Phase 2G, removed featured work and the evidence
 * columns (citation ids and reference counts) from these reads, along with the
 * Intellectual Record repository that sat beside this one. Phase 2I removed the
 * legacy `type` half of the kind predicate: every row carries a canonical
 * `content_kind`, so a tab selects on it alone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface ProfileRelationshipCounts {
  followerCount: number;
  followingCount: number;
}

export interface ProfileViewerRelationship {
  isFollowing: boolean;
  isBlocked: boolean;
}

/** The projection both publication branches share. */
export interface ProfilePublicationRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  content_kind: string | null;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  status?: string;
}

export interface ProfilePublicationBranches {
  owned: ProfilePublicationRow[];
  coauthored: ProfilePublicationRow[];
}

export interface ProfilePageRepository {
  /** Public: the header states both as facts. */
  relationshipCounts(profileId: string): Promise<ProfileRelationshipCounts>;
  /** Authenticated, and only for a viewer who is not the owner. */
  viewerRelationship(profileId: string, viewerId: string): Promise<ProfileViewerRelationship>;
  /**
   * The two branches, with the bounds the existing merge expects. A row is
   * selected when its `content_kind` is one of `contentKinds`. The merge stays
   * in `lib/profileViewData.ts`.
   */
  publicationBranches(input: {
    profileId: string;
    contentKinds: readonly string[];
    start: number;
    limit: number;
  }): Promise<ProfilePublicationBranches>;
  readonly backend: "supabase" | "postgres";
}

// ── PostgreSQL ───────────────────────────────────────────────────────

const RELATIONSHIP_COUNTS_SQL = `
  select
    (select count(*) from public.follows where following_id = $1::uuid) as follower_count,
    (select count(*) from public.follows where follower_id = $1::uuid) as following_count
`;

/** Two `maybeSingle()` lookups as two `exists` in one row. */
const VIEWER_RELATIONSHIP_SQL = `
  select
    exists(select 1 from public.follows
            where follower_id = $2::uuid and following_id = $1::uuid) as is_following,
    exists(select 1 from public.user_blocks
            where blocker_id = $2::uuid and blocked_id = $1::uuid) as is_blocked
`;

/**
 * Both publication branches in one statement.
 *
 * The bounds are the ones the existing code uses and are deliberately not
 * reconciled: owned is offset-paginated, co-authored takes from the top. See
 * the note at the top of this file.
 *
 *  $1  profile id      $4  limit
 *  $2  content kinds   $5  co-authored limit (start + limit)
 *  $3  offset
 */
const PUBLICATION_BRANCHES_SQL = `
  with kinds as (
    select value as k from jsonb_array_elements_text($2::text::jsonb) as value
  ),
  owned as (
    select
      p.*,
      'owned' as branch,
      row_number() over (
        order by p.published_at desc nulls last, p.created_at desc
      ) as ord
    from public.posts as p
    where p.author_id = $1::uuid
      and p.status = 'published'
      and p.content_kind in (select k from kinds)
    order by p.published_at desc nulls last, p.created_at desc
    offset $3::int
    limit $4::int
  ),
  coauthored as (
    select
      p.*,
      'coauthored' as branch,
      row_number() over (order by a.accepted_at desc) as ord
    from public.post_authors as a
    join public.posts as p on p.id = a.post_id
    where a.user_id = $1::uuid
      and a.accepted_at is not null
    order by a.accepted_at desc
    limit $5::int
  ),
  merged as (
    select * from owned
    union all
    select * from coauthored
  )
  select
    m.branch, m.id, m.author_id, m.title, m.slug, m.excerpt,
    m.content_kind,
    m.created_at, m.published_at, m.cover_image_url,
    -- The owned branch's PostgREST projection does not carry status: only
    -- the co-authored branch needs it, because only that one is filtered on
    -- it in TypeScript.
    case when m.branch = 'owned' then null else m.status end as status
  from merged as m
  -- A CTE's own ORDER BY selects the right slice but does not survive into
  -- the outer query. The ord column ranks rows within each branch, computed
  -- where that branch's ordering is in scope.
  order by (case when m.branch = 'owned' then 0 else 1 end), m.ord
`;

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function toPublicationRow(row: Record<string, unknown>): ProfilePublicationRow {
  return {
    id: String(row.id),
    author_id: String(row.author_id),
    title: (row.title as string | null) ?? null,
    slug: String(row.slug),
    excerpt: (row.excerpt as string | null) ?? null,
    content_kind: (row.content_kind as string | null) ?? null,
    created_at: toIso(row.created_at) ?? "",
    published_at: toIso(row.published_at),
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    // Null counts as absent, not as a value. The UNION has to project a
    // `status` column for both branches, and the owned branch sets it null
    // because the PostgREST projection it mirrors does not select status at
    // all. Passing that null through String() once turned it into the string
    // "null", which a consumer comparing against "published" read as
    // unpublished.
    ...(row.status === undefined || row.status === null
      ? {}
      : { status: String(row.status) }),
  };
}

export function createPostgresProfilePageRepository(
  executor: SqlExecutor
): ProfilePageRepository {
  return {
    backend: "postgres",

    async relationshipCounts(profileId) {
      const [row] = await executor.query<Record<string, unknown>>(
        RELATIONSHIP_COUNTS_SQL,
        [profileId]
      );
      return {
        followerCount: toNumber(row?.follower_count),
        followingCount: toNumber(row?.following_count),
      };
    },

    async viewerRelationship(profileId, viewerId) {
      const [row] = await executor.query<Record<string, unknown>>(
        VIEWER_RELATIONSHIP_SQL,
        [profileId, viewerId]
      );
      return {
        isFollowing: row?.is_following === true,
        isBlocked: row?.is_blocked === true,
      };
    },

    async publicationBranches({ profileId, contentKinds, start, limit }) {
      const rows = await executor.query<Record<string, unknown>>(
        PUBLICATION_BRANCHES_SQL,
        [
          profileId,
          JSON.stringify([...contentKinds]),
          start,
          limit,
          start + limit,
        ]
      );

      const owned: ProfilePublicationRow[] = [];
      const coauthored: ProfilePublicationRow[] = [];
      for (const row of rows) {
        (row.branch === "owned" ? owned : coauthored).push(toPublicationRow(row));
      }
      return { owned, coauthored };
    },
  };
}

// ── Supabase ─────────────────────────────────────────────────────────

const PUBLICATION_SELECT =
  "id, author_id, title, slug, excerpt, content_kind, created_at, published_at, cover_image_url";

/** A database error is an error, not an empty list. */
function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
}

export function createSupabaseProfilePageRepository(
  supabase: SupabaseClient
): ProfilePageRepository {
  return {
    backend: "supabase",

    async relationshipCounts(profileId) {
      const [followers, following] = await Promise.all([
        supabase
          .from("follows")
          .select("following_id", { count: "exact", head: true })
          .eq("following_id", profileId),
        supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("follower_id", profileId),
      ]);

      if (followers.error) throw new Error(`follower count failed: ${followers.error.message}`);
      if (following.error) throw new Error(`following count failed: ${following.error.message}`);

      return {
        followerCount: followers.count ?? 0,
        followingCount: following.count ?? 0,
      };
    },

    async viewerRelationship(profileId, viewerId) {
      const [follow, block] = await Promise.all([
        supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", viewerId)
          .eq("following_id", profileId)
          .maybeSingle(),
        supabase
          .from("user_blocks")
          .select("blocker_id")
          .eq("blocker_id", viewerId)
          .eq("blocked_id", profileId)
          .maybeSingle(),
      ]);

      // A failed lookup is not "not following". Rendering a Follow button
      // to somebody who already follows invites a duplicate, and rendering
      // an unblocked profile to somebody who blocked it is worse.
      if (follow.error) {
        throw new Error(`follow state failed: ${follow.error.message}`);
      }
      if (block.error) {
        throw new Error(`block state failed: ${block.error.message}`);
      }

      return {
        isFollowing: follow.data !== null,
        isBlocked: block.data !== null,
      };
    },

    async publicationBranches({ profileId, contentKinds, start, limit }) {
      const [ownedResult, coauthoredResult] = await Promise.all([
        supabase
          .from("posts")
          .select(PUBLICATION_SELECT)
          .eq("author_id", profileId)
          .eq("status", "published")
          .in("content_kind", [...contentKinds])
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(start, start + limit - 1),
        supabase
          .from("post_authors")
          .select(`posts!post_authors_post_id_fkey(${PUBLICATION_SELECT}, status)`)
          .eq("user_id", profileId)
          .not("accepted_at", "is", null)
          .order("accepted_at", { ascending: false })
          .limit(start + limit),
      ]);

      const owned = rows<ProfilePublicationRow>(ownedResult, "publications failed");
      const wrappers = rows<{ posts: unknown }>(
        coauthoredResult,
        "co-authored publications failed"
      );

      const coauthored = wrappers
        .map((wrapper) =>
          Array.isArray(wrapper.posts)
            ? ((wrapper.posts[0] as ProfilePublicationRow | undefined) ?? null)
            : ((wrapper.posts as ProfilePublicationRow | null) ?? null)
        )
        .filter((row): row is ProfilePublicationRow => row !== null);

      return { owned, coauthored };
    },
  };
}
