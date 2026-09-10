import "server-only";

/**
 * The public profile page's reads, as PostgreSQL.
 *
 * The identity row already moved (see `lib/db/supabase/profiles.ts` and its
 * PostgreSQL twin). This is everything else the page loads: the relationship
 * counts, the viewer's relationship to the profile, the opportunity banner,
 * featured work, and the publication list.
 *
 * Same production database, not Neon. What changes is that these stop
 * travelling through the gateway.
 *
 * ## Two places where faithful is not the same as tidy
 *
 * **The publication pagination is quirky and is reproduced quirk and all.**
 * The owned branch is offset-paginated; the co-authored branch takes
 * `start + pageSize + 1` rows from the top and is then merged and re-sorted in
 * TypeScript. That means page two is an approximation rather than a clean
 * continuation. It is not obviously right, and it is what the profile has
 * always shown, so this returns the same two branches with the same bounds and
 * leaves the merge exactly where it was. Replacing it with a correct UNION
 * would change which posts appear on page two, which is a product change
 * wearing a refactor's clothes.
 *
 * **Featured work keeps unpublished selections.** A member can feature a post
 * and later unpublish it; the row stays and the caller decides what to do with
 * it. So the join does not filter on status, and `status` is returned.
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
  isSubscribed: boolean;
  isBlocked: boolean;
}

export interface ProfileOpportunityRow {
  id: string;
  open_to_opportunities: boolean;
  visibility: string;
}

/** The projection both publication branches and featured work share. */
export interface ProfilePublicationRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  in_response_to: string | null;
  excerpt: string | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  tags: string[] | null;
  citation_id: string | null;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  status?: string;
  post_reference_counts?: { reference_count: number | null } | null;
}

export interface FeaturedWorkRow {
  post_id: string;
  position: number;
  feature_note?: string | null;
  posts: ProfilePublicationRow | null;
}

export interface ProfilePublicationBranches {
  owned: ProfilePublicationRow[];
  coauthored: ProfilePublicationRow[];
}

export interface ProfilePageRepository {
  /** Public: the header states both as facts. */
  relationshipCounts(profileId: string): Promise<ProfileRelationshipCounts>;
  /** Authenticated, and only for a viewer who is not the owner. */
  viewerRelationship(
    profileId: string,
    viewerId: string,
    options: { includeSubscription: boolean }
  ): Promise<ProfileViewerRelationship>;
  opportunityState(profileId: string): Promise<ProfileOpportunityRow | null>;
  featuredWork(
    profileId: string,
    options: { includeNote: boolean }
  ): Promise<FeaturedWorkRow[]>;
  /**
   * The two branches, with the bounds the existing merge expects. The merge
   * itself stays in `lib/profileViewData.ts`; see the note above.
   */
  publicationBranches(input: {
    profileId: string;
    contentKind: string;
    legacyTypes: readonly string[];
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

/**
 * Three `maybeSingle()` lookups as three `exists` in one row.
 *
 * The subscription flag is gated by a feature flag the repository has no
 * opinion about, so the caller says whether to ask rather than the SQL
 * guessing.
 */
const VIEWER_RELATIONSHIP_SQL = `
  select
    exists(select 1 from public.follows
            where follower_id = $2::uuid and following_id = $1::uuid) as is_following,
    ($3::boolean and exists(
      select 1 from public.author_subscriptions
        where subscriber_id = $2::uuid and author_id = $1::uuid)) as is_subscribed,
    exists(select 1 from public.user_blocks
            where blocker_id = $2::uuid and blocked_id = $1::uuid) as is_blocked
`;

const OPPORTUNITY_SQL = `
  select id, open_to_opportunities, visibility
  from public.talent_profiles
  where user_id = $1::uuid
  limit 2
`;

/**
 * Featured selections with their posts.
 *
 * A LEFT JOIN, not an inner one: PostgREST returns the row with a null embed
 * when the post is gone, and the caller distinguishes "featured a post that
 * was deleted" from "featured nothing".
 */
const FEATURED_WORK_SQL = `
  select
    f.post_id,
    f.position,
    $2::boolean as with_note,
    case when $2::boolean then f.feature_note else null end as feature_note,
    case when p.id is null then null else jsonb_build_object(
      'id', p.id,
      'author_id', p.author_id,
      'title', p.title,
      'slug', p.slug,
      'in_response_to', p.in_response_to,
      'excerpt', p.excerpt,
      'type', p.type,
      'content_kind', p.content_kind,
      'article_format', p.article_format,
      'tags', to_jsonb(p.tags),
      'citation_id', p.citation_id,
      'created_at', p.created_at,
      'published_at', p.published_at,
      'cover_image_url', p.cover_image_url,
      'status', p.status,
      'post_reference_counts', case when rc.post_id is null then null
        else jsonb_build_object('reference_count', rc.reference_count) end
    ) end as posts
  from public.profile_featured_posts as f
  left join public.posts as p on p.id = f.post_id
  left join public.post_reference_counts as rc on rc.post_id = p.id
  where f.user_id = $1::uuid
  order by f.position asc
`;

/**
 * Both publication branches in one statement.
 *
 * The bounds are the ones the existing code uses and are deliberately not
 * reconciled: owned is offset-paginated, co-authored takes from the top. See
 * the note at the top of this file.
 *
 * The content-kind filter reproduces `contentKindFilter`: the new-model kind,
 * or a legacy `type` when `content_kind` was never populated.
 */
const PUBLICATION_BRANCHES_SQL = `
  with legacy as (
    select value as t from jsonb_array_elements_text($3::text::jsonb) as value
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
      and (
        p.content_kind = $2::text
        or (p.content_kind is null and p.type in (select t from legacy))
      )
    order by p.published_at desc nulls last, p.created_at desc
    offset $4::int
    limit $5::int
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
    limit $6::int
  ),
  merged as (
    select * from owned
    union all
    select * from coauthored
  )
  select
    m.branch, m.id, m.author_id, m.title, m.slug, m.in_response_to, m.excerpt,
    m.type, m.content_kind, m.article_format, to_jsonb(m.tags) as tags,
    m.citation_id, m.created_at, m.published_at, m.cover_image_url,
    -- The owned branch's PostgREST projection does not carry status: only
    -- the co-authored branch needs it, because only that one is filtered on
    -- it in TypeScript. Returning it on both is more than the contract
    -- promises, and parity is right to call that a difference.
    case when m.branch = 'owned' then null else m.status end as status,
    case when rc.post_id is null then null
      else jsonb_build_object('reference_count', rc.reference_count) end
      as post_reference_counts
  from merged as m
  left join public.post_reference_counts as rc on rc.post_id = m.id
  -- A CTE's own ORDER BY selects the right slice but does not survive into
  -- the outer query: without this, rows arrive in whatever order the join
  -- produced. PostgREST returned each branch sorted, and the caller's merge
  -- happens to re-sort, so the difference is invisible until something reads
  -- a branch directly. The ord column ranks rows within each branch, computed
  -- where that branch ordering is in scope.
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

function toTags(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function toPublicationRow(row: Record<string, unknown>): ProfilePublicationRow {
  return {
    id: String(row.id),
    author_id: String(row.author_id),
    title: (row.title as string | null) ?? null,
    slug: String(row.slug),
    in_response_to: (row.in_response_to as string | null) ?? null,
    excerpt: (row.excerpt as string | null) ?? null,
    type: String(row.type),
    content_kind: (row.content_kind as string | null) ?? null,
    article_format: (row.article_format as string | null) ?? null,
    tags: toTags(row.tags),
    citation_id: (row.citation_id as string | null) ?? null,
    created_at: toIso(row.created_at) ?? "",
    published_at: toIso(row.published_at),
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    // Null counts as absent, not as a value. The UNION has to project a
    // `status` column for both branches, and the owned branch sets it null
    // because the PostgREST projection it mirrors does not select status at
    // all. Testing only for undefined sent that null through String(), so an
    // owned row came back carrying the four-character string "null", which a
    // consumer comparing against "published" would read as unpublished.
    ...(row.status === undefined || row.status === null
      ? {}
      : { status: String(row.status) }),
    post_reference_counts:
      (row.post_reference_counts as ProfilePublicationRow["post_reference_counts"]) ??
      null,
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

    async viewerRelationship(profileId, viewerId, { includeSubscription }) {
      const [row] = await executor.query<Record<string, unknown>>(
        VIEWER_RELATIONSHIP_SQL,
        [profileId, viewerId, includeSubscription]
      );
      return {
        isFollowing: row?.is_following === true,
        isSubscribed: row?.is_subscribed === true,
        isBlocked: row?.is_blocked === true,
      };
    },

    async opportunityState(profileId) {
      const rows = await executor.query<Record<string, unknown>>(OPPORTUNITY_SQL, [
        profileId,
      ]);
      // `.maybeSingle()` fails on two rows rather than picking one, and
      // `talent_profiles.user_id` is unique, so this keeps a lost constraint
      // loud instead of showing an arbitrary banner.
      if (rows.length > 1) {
        throw new Error("opportunity state failed: user_id matched two rows");
      }
      if (rows.length === 0) return null;
      return {
        id: String(rows[0].id),
        open_to_opportunities: rows[0].open_to_opportunities === true,
        visibility: String(rows[0].visibility),
      };
    },

    async featuredWork(profileId, { includeNote }) {
      const rows = await executor.query<Record<string, unknown>>(FEATURED_WORK_SQL, [
        profileId,
        includeNote,
      ]);

      return rows.map((row) => ({
        post_id: String(row.post_id),
        position: toNumber(row.position),
        ...(includeNote
          ? { feature_note: (row.feature_note as string | null) ?? null }
          : {}),
        posts: row.posts
          ? toPublicationRow(row.posts as Record<string, unknown>)
          : null,
      }));
    },

    async publicationBranches({ profileId, contentKind, legacyTypes, start, limit }) {
      const rows = await executor.query<Record<string, unknown>>(
        PUBLICATION_BRANCHES_SQL,
        [
          profileId,
          contentKind,
          JSON.stringify([...legacyTypes]),
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
  "id, author_id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, citation_id, created_at, published_at, cover_image_url, post_reference_counts(reference_count)";

function contentKindOr(contentKind: string, legacyTypes: readonly string[]) {
  const legacyClause =
    legacyTypes.length > 0
      ? `,and(content_kind.is.null,type.in.(${legacyTypes.join(",")}))`
      : "";
  return `content_kind.eq.${contentKind}${legacyClause}`;
}

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

    async viewerRelationship(profileId, viewerId, { includeSubscription }) {
      const [follow, subscription, block] = await Promise.all([
        supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", viewerId)
          .eq("following_id", profileId)
          .maybeSingle(),
        includeSubscription
          ? supabase
              .from("author_subscriptions")
              .select("subscriber_id")
              .eq("subscriber_id", viewerId)
              .eq("author_id", profileId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("user_blocks")
          .select("blocker_id")
          .eq("blocker_id", viewerId)
          .eq("blocked_id", profileId)
          .maybeSingle(),
      ]);

      // A failed lookup is not "not following". Rendering a Follow button
      // to somebody who already follows invites a duplicate, and rendering
      // an unblocked profile to somebody who blocked it is worse. Live
      // parity found this: the direct read saw the follow edge and this one
      // reported false, because its request had failed and nobody looked.
      if (follow.error) {
        throw new Error(`follow state failed: ${follow.error.message}`);
      }
      if (subscription.error) {
        throw new Error(
          `subscription state failed: ${subscription.error.message}`
        );
      }
      if (block.error) {
        throw new Error(`block state failed: ${block.error.message}`);
      }

      return {
        isFollowing: follow.data !== null,
        isSubscribed: subscription.data !== null,
        isBlocked: block.data !== null,
      };
    },

    async opportunityState(profileId) {
      const { data, error } = await supabase
        .from("talent_profiles")
        .select("id, open_to_opportunities, visibility")
        .eq("user_id", profileId)
        .maybeSingle();

      if (error) throw new Error(`opportunity state failed: ${error.message}`);
      return (data as ProfileOpportunityRow | null) ?? null;
    },

    async featuredWork(profileId, { includeNote }) {
      const noteColumn = includeNote ? ", feature_note" : "";
      const result = await supabase
        .from("profile_featured_posts")
        .select(
          `post_id, position${noteColumn}, posts!profile_featured_posts_post_id_fkey(${PUBLICATION_SELECT}, status)`
        )
        .eq("user_id", profileId)
        .order("position", { ascending: true });

      const data = rows<Record<string, unknown>>(result, "featured work failed");
      return data.map((row) => ({
        post_id: String(row.post_id),
        position: Number(row.position),
        ...(includeNote
          ? { feature_note: (row.feature_note as string | null) ?? null }
          : {}),
        posts: (Array.isArray(row.posts)
          ? ((row.posts[0] as ProfilePublicationRow | undefined) ?? null)
          : ((row.posts as ProfilePublicationRow | null) ?? null)),
      }));
    },

    async publicationBranches({ profileId, contentKind, legacyTypes, start, limit }) {
      const [ownedResult, coauthoredResult] = await Promise.all([
        supabase
          .from("posts")
          .select(PUBLICATION_SELECT)
          .eq("author_id", profileId)
          .eq("status", "published")
          .or(contentKindOr(contentKind, legacyTypes))
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
