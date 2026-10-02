import "server-only";

/**
 * The public profile page's reads, as PostgreSQL and as PostgREST.
 *
 * The identity row lives in `lib/db/supabase/profiles.ts` and its PostgreSQL
 * twin. This is everything else the page loads: the relationship counts, the
 * viewer's relationship to the profile, the Posts and Articles lists, and the
 * owner's Drafts.
 *
 * Same production database, not Neon. What changes on the direct path is that
 * these stop travelling through the gateway.
 *
 * ## Where faithful is not the same as tidy
 *
 * **Publications are the writer's own published Posts and Articles.**
 * The owned branch is offset-paginated; the co-authored branch takes
 * `start + pageSize + 1` rows from the top and is then merged and re-sorted in
 * TypeScript. That means page two is an approximation rather than a clean
 * continuation. It is what the profile has always shown, so this returns the
 * same two branches with the same bounds and leaves the merge where it was.
 * Replacing it with a correct UNION would change which posts appear on page
 * two, which is a product change wearing a refactor's clothes.
 *
 * The publishing reset, Phase 2G, removed the old multi-item Featured Work
 * manager and the evidence columns from these reads. Profile V3 restores one
 * deliberately narrow Selected Work read while keeping the retired record
 * repository gone. Phase 2I removed the
 * legacy `type` half of the kind predicate: every row carries a canonical
 * `content_kind`, so a tab selects on it alone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import { toBoolean, toStringArray } from "@/lib/db/postgres/normalise";
import { profileVisibleSql } from "@/lib/db/profileVisibility";

// ── Shapes ───────────────────────────────────────────────────────────

export interface ProfileRelationshipCounts {
  followerCount: number;
  followingCount: number;
}

export interface ProfileViewerRelationship {
  isFollowing: boolean;
  isBlocked: boolean;
}

export interface ProfilePublicationCounts {
  articleCount: number;
  postCount: number;
}

export interface ProfilePublicationActivityPoint {
  /** Calendar month in UTC, YYYY-MM. */
  month: string;
  count: number;
}

export interface ProfileWritingTopic {
  /** Normalized topic key derived from published work. */
  key: string;
  /** Number of published Posts/Articles carrying this topic. */
  count: number;
}

export interface ProfileRelatedThinker {
  id: string;
  username: string;
  fullName: string | null;
  avatarUrl: string | null;
  professionalTitle: string | null;
  /** Demonstrated publishing topics shared with the profile owner. */
  sharedTopics: string[];
  /** Whether the profile owner follows this thinker. */
  ownerFollows: boolean;
  /** Whether this thinker follows the profile owner. */
  followsOwner: boolean;
  /** Whether the current viewer follows this thinker. */
  viewerFollows: boolean;
  latestPublishedAt: string | null;
}

export interface ProfileSelectedWorkRow extends ProfilePublicationRow {}

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
  word_count?: number | null;
}

export interface ProfilePublicationBranches {
  owned: ProfilePublicationRow[];
  coauthored: ProfilePublicationRow[];
}

/** The projection the owner's Drafts tab reads. */
export interface ProfileDraftRow {
  id: string;
  title: string | null;
  content_kind: string | null;
  updated_at: string;
  excerpt?: string | null;
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
  /** Exact published Posts/Articles totals for the work-first Overview. */
  publicationCounts(profileId: string): Promise<ProfilePublicationCounts>;
  /** Exact month-by-month publication activity for the requested UTC window. */
  publicationActivity(input: {
    profileId: string;
    startMonth: string;
    months: number;
  }): Promise<ProfilePublicationActivityPoint[]>;
  /** Most common topics across this writer's published Posts and Articles. */
  publicationTopics(input: {
    profileId: string;
    limit: number;
  }): Promise<ProfileWritingTopic[]>;
  /**
   * Directory-listed writers who demonstrate the same publishing topics.
   * Follow edges are ranking/context signals, never the source of the match.
   */
  relatedThinkers(input: {
    profileId: string;
    topicKeys: readonly string[];
    viewerId: string | null;
    limit: number;
  }): Promise<ProfileRelatedThinker[]>;
  /** Profile V3's one owner-selected published Post or Article. */
  selectedWork(profileId: string): Promise<ProfileSelectedWorkRow | null>;
  /**
   * The owner's own drafts, newest edit first. Owner-only, and authorized
   * here rather than left to RLS: a direct connection has no policy to refuse
   * a stranger's drafts, so a profile that is not the viewer's answers empty
   * without asking the database.
   */
  ownerDrafts(input: { profileId: string; viewerId: string }): Promise<ProfileDraftRow[]>;
  readonly backend: "supabase" | "postgres";
}

function isOwner({ profileId, viewerId }: { profileId: string; viewerId: string }) {
  return Boolean(viewerId) && profileId === viewerId;
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
  select
    'owned' as branch, p.id, p.author_id, p.title, p.slug, p.excerpt,
    p.content_kind, p.created_at, p.published_at, p.cover_image_url, p.word_count
  from public.posts as p
  where p.author_id = $1::uuid
    and p.status = 'published'
    and p.content_kind in (
      select value from jsonb_array_elements_text($2::text::jsonb)
    )
  order by p.published_at desc nulls last, p.created_at desc
  offset $3::int
  limit $4::int
`;

/**
 * The owner's drafts. `author_id = $1` is the whole authorization on a direct
 * connection, which is why the repository only runs it for the owner.
 */
const PUBLICATION_COUNTS_SQL = `
  select
    count(*) filter (where p.content_kind = 'article') as article_count,
    count(*) filter (where p.content_kind = 'post') as post_count
  from public.posts as p
  where p.author_id = $1::uuid
    and p.status = 'published'
    and p.content_kind in ('article', 'post')
`;

const PUBLICATION_ACTIVITY_SQL = `
  with months as (
    select generate_series(
      $2::timestamptz,
      $2::timestamptz + make_interval(months => greatest($3::int - 1, 0)),
      interval '1 month'
    ) as month_start
  )
  select
    to_char(m.month_start at time zone 'UTC', 'YYYY-MM') as month,
    count(p.id)::int as publication_count
  from months as m
  left join public.posts as p
    on p.author_id = $1::uuid
   and p.status = 'published'
   and p.content_kind in ('article', 'post')
   and coalesce(p.published_at, p.created_at) >= m.month_start
   and coalesce(p.published_at, p.created_at) < m.month_start + interval '1 month'
  group by m.month_start
  order by m.month_start asc
`;

const PUBLICATION_TOPICS_SQL = `
  select
    topics.topic_key as topic_key,
    count(*)::int as publication_count,
    max(coalesce(p.published_at, p.created_at)) as latest_at
  from public.posts as p
  cross join lateral (
    select distinct lower(btrim(input.topic_key)) as topic_key
    from unnest(coalesce(p.topic_keys, '{}'::text[])) as input(topic_key)
    where char_length(btrim(input.topic_key)) between 1 and 80
  ) as topics
  where p.author_id = $1::uuid
    and p.status = 'published'
    and p.content_kind in ('article', 'post')
  group by topics.topic_key
  order by publication_count desc, latest_at desc, topics.topic_key asc
  limit $2::int
`;

const RELATED_THINKERS_MATCH_WINDOW = 300;
const RELATED_THINKERS_CANDIDATE_LIMIT = 72;

const RELATED_THINKERS_SQL = `
  with topic_input as (
    select distinct lower(btrim(value)) as topic_key
    from jsonb_array_elements_text($2::text::jsonb)
    where char_length(btrim(value)) between 1 and 80
  ),
  recent_matching_posts as (
    select
      p.author_id,
      p.topic_keys,
      coalesce(p.published_at, p.created_at) as published_at
    from public.posts as p
    where p.author_id <> $1::uuid
      and p.status = 'published'
      and p.content_kind in ('article', 'post')
      and p.topic_keys && (
        select coalesce(array_agg(topic_key), '{}'::text[]) from topic_input
      )
    order by coalesce(p.published_at, p.created_at) desc, p.id desc
    limit ${RELATED_THINKERS_MATCH_WINDOW}
  ),
  topic_candidates as (
    select
      matched.author_id as candidate_id,
      array_agg(distinct shared.topic_key order by shared.topic_key) as shared_topics,
      count(distinct shared.topic_key)::int as shared_topic_count,
      max(matched.published_at) as latest_published_at
    from recent_matching_posts as matched
    cross join lateral (
      select distinct lower(btrim(input.topic_key)) as topic_key
      from unnest(coalesce(matched.topic_keys, '{}'::text[])) as input(topic_key)
      join topic_input as wanted
        on wanted.topic_key = lower(btrim(input.topic_key))
    ) as shared
    group by matched.author_id
    order by shared_topic_count desc, latest_published_at desc, matched.author_id
    limit ${RELATED_THINKERS_CANDIDATE_LIMIT}
  ),
  network as (
    select
      edges.candidate_id,
      bool_or(edges.owner_follows) as owner_follows,
      bool_or(edges.follows_owner) as follows_owner
    from (
      select following_id as candidate_id, true as owner_follows, false as follows_owner
      from public.follows
      where follower_id = $1::uuid
      union all
      select follower_id as candidate_id, false as owner_follows, true as follows_owner
      from public.follows
      where following_id = $1::uuid
    ) as edges
    group by edges.candidate_id
  )
  select
    candidate.candidate_id::text as id,
    person.username,
    person.full_name,
    person.avatar_url,
    person.professional_title,
    to_jsonb(candidate.shared_topics) as shared_topics,
    candidate.shared_topic_count,
    to_jsonb(candidate.latest_published_at) #>> '{}' as latest_published_at,
    coalesce(network.owner_follows, false) as owner_follows,
    coalesce(network.follows_owner, false) as follows_owner,
    exists (
      select 1
      from public.follows as viewer_follow
      where viewer_follow.follower_id = $3::uuid
        and viewer_follow.following_id = candidate.candidate_id
    ) as viewer_follows
  from topic_candidates as candidate
  join public.profiles as person
    on person.id = candidate.candidate_id
  left join network
    on network.candidate_id = candidate.candidate_id
  where person.username is not null
    and ($3::uuid is null or candidate.candidate_id <> $3::uuid)
    and ${profileVisibleSql("person", "$3")}
    and coalesce(person.privacy_settings ->> 'show_in_directory', 'true') = 'true'
  order by
    candidate.shared_topic_count desc,
    (case when coalesce(network.owner_follows, false) then 1 else 0 end
      + case when coalesce(network.follows_owner, false) then 1 else 0 end) desc,
    candidate.latest_published_at desc,
    person.username asc
  limit $4::int
`;

const SELECTED_WORK_SQL = `
  select
    p.id, p.author_id, p.title, p.slug, p.excerpt, p.content_kind,
    p.created_at, p.published_at, p.cover_image_url, p.word_count
  from public.profile_featured_posts as selected
  join public.posts as p on p.id = selected.post_id
  where selected.user_id = $1::uuid
    and selected.position = 1
    and p.author_id = $1::uuid
    and p.status = 'published'
    and p.content_kind in ('post', 'article')
  limit 1
`;

const OWNER_DRAFTS_SQL = `
  select p.id, p.title, p.content_kind, p.updated_at, p.excerpt
  from public.posts as p
  where p.author_id = $1::uuid
    and p.status = 'draft'
  order by p.updated_at desc, p.id desc
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
    word_count: row.word_count == null ? null : toNumber(row.word_count),
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
        [profileId, JSON.stringify([...contentKinds]), start, limit]
      );

      const owned = rows.map(toPublicationRow);
      return { owned, coauthored: [] };
    },

    async publicationCounts(profileId) {
      const [row] = await executor.query<Record<string, unknown>>(
        PUBLICATION_COUNTS_SQL,
        [profileId]
      );
      return {
        articleCount: toNumber(row?.article_count),
        postCount: toNumber(row?.post_count),
      };
    },

    async publicationActivity({ profileId, startMonth, months }) {
      const safeMonths = Math.max(1, Math.min(24, Math.trunc(months)));
      const rows = await executor.query<Record<string, unknown>>(
        PUBLICATION_ACTIVITY_SQL,
        [profileId, startMonth, safeMonths]
      );
      return rows.map((row) => ({
        month: String(row.month ?? ""),
        count: toNumber(row.publication_count),
      }));
    },

    async publicationTopics({ profileId, limit }) {
      const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
      const rows = await executor.query<Record<string, unknown>>(
        PUBLICATION_TOPICS_SQL,
        [profileId, safeLimit]
      );
      return rows.map((row) => ({
        key: String(row.topic_key ?? '').trim().toLowerCase(),
        count: toNumber(row.publication_count),
      })).filter((topic) => topic.key.length > 0 && topic.count > 0);
    },

    async relatedThinkers({ profileId, topicKeys: inputTopics, viewerId, limit }) {
      const normalizedTopics = topicKeys(inputTopics).slice(0, 8);
      if (normalizedTopics.length === 0) return [];
      const safeLimit = Math.max(1, Math.min(6, Math.trunc(limit)));
      const rows = await executor.query<Record<string, unknown>>(
        RELATED_THINKERS_SQL,
        [profileId, JSON.stringify(normalizedTopics), viewerId, safeLimit]
      );
      return rows.map((row) => ({
        id: String(row.id),
        username: String(row.username),
        fullName: (row.full_name as string | null) ?? null,
        avatarUrl: (row.avatar_url as string | null) ?? null,
        professionalTitle: (row.professional_title as string | null) ?? null,
        sharedTopics: toStringArray(row.shared_topics) ?? [],
        ownerFollows: toBoolean(row.owner_follows),
        followsOwner: toBoolean(row.follows_owner),
        viewerFollows: toBoolean(row.viewer_follows),
        latestPublishedAt: toIso(row.latest_published_at),
      }));
    },

    async selectedWork(profileId) {
      const [row] = await executor.query<Record<string, unknown>>(SELECTED_WORK_SQL, [profileId]);
      return row ? toPublicationRow(row) : null;
    },

    async ownerDrafts(input) {
      if (!isOwner(input)) return [];
      const rows = await executor.query<Record<string, unknown>>(
        OWNER_DRAFTS_SQL,
        [input.viewerId]
      );
      return rows.map((row) => ({
        id: String(row.id),
        title: (row.title as string | null) ?? null,
        content_kind: (row.content_kind as string | null) ?? null,
        updated_at: toIso(row.updated_at) ?? "",
        excerpt: (row.excerpt as string | null) ?? null,
      }));
    },
  };
}

// ── Supabase ─────────────────────────────────────────────────────────

const PUBLICATION_SELECT =
  "id, author_id, title, slug, excerpt, content_kind, created_at, published_at, cover_image_url, word_count";
const DRAFT_SELECT = "id, title, content_kind, updated_at, excerpt";

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

function monthWindow(startMonth: string, months: number) {
  const parsed = new Date(startMonth);
  if (Number.isNaN(parsed.getTime())) throw new Error("invalid profile activity start month");
  const safeMonths = Math.max(1, Math.min(24, Math.trunc(months)));
  return Array.from({ length: safeMonths }, (_, index) => {
    const start = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + index, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return {
      month: start.toISOString().slice(0, 7),
      start: start.toISOString(),
      end: end.toISOString(),
    };
  });
}

function topicKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0 && item.length <= 80)
  )];
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
      const ownedResult = await supabase
        .from("posts")
        .select(PUBLICATION_SELECT)
        .eq("author_id", profileId)
        .eq("status", "published")
        .in("content_kind", [...contentKinds])
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(start, start + limit - 1);

      const owned = rows<ProfilePublicationRow>(ownedResult, "publications failed");
      return { owned, coauthored: [] };
    },

    async publicationCounts(profileId) {
      const [articles, posts] = await Promise.all([
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", profileId)
          .eq("status", "published")
          .eq("content_kind", "article"),
        supabase
          .from("posts")
          .select("id", { count: "exact", head: true })
          .eq("author_id", profileId)
          .eq("status", "published")
          .eq("content_kind", "post"),
      ]);
      if (articles.error) throw new Error(`article count failed: ${articles.error.message}`);
      if (posts.error) throw new Error(`post count failed: ${posts.error.message}`);
      return { articleCount: articles.count ?? 0, postCount: posts.count ?? 0 };
    },

    async publicationActivity({ profileId, startMonth, months }) {
      const windows = monthWindow(startMonth, months);
      const first = windows[0];
      const last = windows[windows.length - 1];
      if (!first || !last) return [];

      const pageSize = 500;
      const rowsForWindow: Array<{ published_at: string | null; created_at: string }> = [];
      let start = 0;

      while (true) {
        const result = await supabase
          .from("posts")
          .select("published_at, created_at")
          .eq("author_id", profileId)
          .eq("status", "published")
          .in("content_kind", ["article", "post"])
          .or(
            `and(published_at.gte.${first.start},published_at.lt.${last.end}),and(published_at.is.null,created_at.gte.${first.start},created_at.lt.${last.end})`
          )
          .order("published_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .range(start, start + pageSize - 1);

        if (result.error) {
          throw new Error(`publication activity failed: ${result.error.message}`);
        }

        const page = (result.data ?? []) as Array<{
          published_at: string | null;
          created_at: string;
        }>;
        rowsForWindow.push(...page);
        if (page.length < pageSize) break;
        start += pageSize;
      }

      const counts = new Map(windows.map((window) => [window.month, 0]));
      for (const row of rowsForWindow) {
        const instant = new Date(row.published_at ?? row.created_at);
        if (Number.isNaN(instant.getTime())) continue;
        const month = `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, "0")}`;
        if (counts.has(month)) counts.set(month, (counts.get(month) ?? 0) + 1);
      }

      return windows.map((window) => ({
        month: window.month,
        count: counts.get(window.month) ?? 0,
      }));
    },

    async publicationTopics({ profileId, limit }) {
      const safeLimit = Math.max(1, Math.min(12, Math.trunc(limit)));
      const pageSize = 500;
      const counts = new Map<string, { count: number; latestAt: string }>();
      let start = 0;

      while (true) {
        const result = await supabase
          .from("posts")
          .select("topic_keys, published_at, created_at")
          .eq("author_id", profileId)
          .eq("status", "published")
          .in("content_kind", ["article", "post"])
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(start, start + pageSize - 1);

        if (result.error) {
          throw new Error(`publication topics failed: ${result.error.message}`);
        }

        const page = (result.data ?? []) as Array<{
          topic_keys: unknown;
          published_at: string | null;
          created_at: string;
        }>;

        for (const row of page) {
          const publishedAt = row.published_at ?? row.created_at;
          for (const key of topicKeys(row.topic_keys)) {
            const current = counts.get(key);
            counts.set(key, {
              count: (current?.count ?? 0) + 1,
              latestAt: current && current.latestAt > publishedAt ? current.latestAt : publishedAt,
            });
          }
        }

        if (page.length < pageSize) break;
        start += pageSize;
      }

      return [...counts.entries()]
        .map(([key, value]) => ({ key, count: value.count, latestAt: value.latestAt }))
        .sort((left, right) =>
          right.count - left.count ||
          right.latestAt.localeCompare(left.latestAt) ||
          left.key.localeCompare(right.key)
        )
        .slice(0, safeLimit)
        .map(({ key, count }) => ({ key, count }));
    },

    async relatedThinkers({ profileId, topicKeys: inputTopics, viewerId, limit }) {
      const normalizedTopics = topicKeys(inputTopics).slice(0, 8);
      if (normalizedTopics.length === 0) return [];
      const safeLimit = Math.max(1, Math.min(6, Math.trunc(limit)));
      const wanted = new Set(normalizedTopics);

      const matching = await supabase
        .from("posts")
        .select("author_id, topic_keys, published_at, created_at")
        .eq("status", "published")
        .in("content_kind", ["article", "post"])
        .neq("author_id", profileId)
        .overlaps("topic_keys", normalizedTopics)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(RELATED_THINKERS_MATCH_WINDOW);

      if (matching.error) {
        throw new Error(`related thinkers publications failed: ${matching.error.message}`);
      }

      const signals = new Map<string, { shared: Set<string>; latestAt: string }>();
      for (const row of (matching.data ?? []) as Array<{
        author_id: string | null;
        topic_keys: unknown;
        published_at: string | null;
        created_at: string;
      }>) {
        if (!row.author_id || row.author_id === profileId) continue;
        const shared = topicKeys(row.topic_keys).filter((key) => wanted.has(key));
        if (shared.length === 0) continue;
        const current = signals.get(row.author_id) ?? { shared: new Set<string>(), latestAt: "" };
        for (const key of shared) current.shared.add(key);
        const publishedAt = row.published_at ?? row.created_at;
        if (publishedAt > current.latestAt) current.latestAt = publishedAt;
        signals.set(row.author_id, current);
      }

      const candidateIds = [...signals.entries()]
        .filter(([id]) => !viewerId || id !== viewerId)
        .sort((left, right) =>
          right[1].shared.size - left[1].shared.size ||
          right[1].latestAt.localeCompare(left[1].latestAt) ||
          left[0].localeCompare(right[0])
        )
        .slice(0, RELATED_THINKERS_CANDIDATE_LIMIT)
        .map(([id]) => id);

      if (candidateIds.length === 0) return [];

      const [profilesResult, ownerFollowingResult, followersResult, viewerFollowingResult] =
        await Promise.all([
          supabase
            .from("profile_directory")
            .select("id, username, full_name, avatar_url, professional_title")
            .in("id", candidateIds)
            .limit(candidateIds.length),
          supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", profileId)
            .in("following_id", candidateIds),
          supabase
            .from("follows")
            .select("follower_id")
            .eq("following_id", profileId)
            .in("follower_id", candidateIds),
          viewerId
            ? supabase
                .from("follows")
                .select("following_id")
                .eq("follower_id", viewerId)
                .in("following_id", candidateIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (profilesResult.error) {
        throw new Error(`related thinkers profiles failed: ${profilesResult.error.message}`);
      }
      if (ownerFollowingResult.error) {
        throw new Error(`related thinkers owner follows failed: ${ownerFollowingResult.error.message}`);
      }
      if (followersResult.error) {
        throw new Error(`related thinkers followers failed: ${followersResult.error.message}`);
      }
      if (viewerFollowingResult.error) {
        throw new Error(`related thinkers viewer follows failed: ${viewerFollowingResult.error.message}`);
      }

      const ownerFollowing = new Set(
        ((ownerFollowingResult.data ?? []) as Array<{ following_id: string }>).map(
          (row) => row.following_id
        )
      );
      const followsOwner = new Set(
        ((followersResult.data ?? []) as Array<{ follower_id: string }>).map(
          (row) => row.follower_id
        )
      );
      const viewerFollowing = new Set(
        ((viewerFollowingResult.data ?? []) as Array<{ following_id: string }>).map(
          (row) => row.following_id
        )
      );

      return ((profilesResult.data ?? []) as Array<{
        id: string;
        username: string;
        full_name: string | null;
        avatar_url: string | null;
        professional_title: string | null;
      }>)
        .map((row) => {
          const signal = signals.get(row.id);
          return signal
            ? {
                id: row.id,
                username: row.username,
                fullName: row.full_name,
                avatarUrl: row.avatar_url,
                professionalTitle: row.professional_title,
                sharedTopics: [...signal.shared].sort(),
                ownerFollows: ownerFollowing.has(row.id),
                followsOwner: followsOwner.has(row.id),
                viewerFollows: viewerFollowing.has(row.id),
                latestPublishedAt: signal.latestAt || null,
              }
            : null;
        })
        .filter((row): row is ProfileRelatedThinker => Boolean(row))
        .sort((left, right) =>
          right.sharedTopics.length - left.sharedTopics.length ||
          (Number(right.ownerFollows) + Number(right.followsOwner)) -
            (Number(left.ownerFollows) + Number(left.followsOwner)) ||
          (right.latestPublishedAt ?? "").localeCompare(left.latestPublishedAt ?? "") ||
          left.username.localeCompare(right.username)
        )
        .slice(0, safeLimit);
    },

    async selectedWork(profileId) {
      const selected = await supabase
        .from("profile_featured_posts")
        .select("post_id")
        .eq("user_id", profileId)
        .eq("position", 1)
        .maybeSingle();
      if (selected.error) throw new Error(`selected work failed: ${selected.error.message}`);
      if (!selected.data?.post_id) return null;

      const publication = await supabase
        .from("posts")
        .select(PUBLICATION_SELECT)
        .eq("id", selected.data.post_id)
        .eq("author_id", profileId)
        .eq("status", "published")
        .in("content_kind", ["post", "article"])
        .maybeSingle();
      if (publication.error) throw new Error(`selected work publication failed: ${publication.error.message}`);
      return (publication.data as ProfilePublicationRow | null) ?? null;
    },

    async ownerDrafts(input) {
      if (!isOwner(input)) return [];
      const result = await supabase
        .from("posts")
        .select(DRAFT_SELECT)
        .eq("author_id", input.viewerId)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false });
      return rows<ProfileDraftRow>(result, "drafts failed");
    },
  };
}
