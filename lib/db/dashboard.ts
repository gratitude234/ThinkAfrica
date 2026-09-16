import "server-only";

/**
 * The member dashboard's reads, as PostgreSQL.
 *
 * Four PostgREST calls, as two business operations. Same production
 * database, not Neon; what changes is the transport.
 *
 * The publishing reset, Phase 2F, removed the reads that fed the dashboard's
 * retired cards: the profile row the completion prompts read, the featured
 * work count the next-action recommender used, unread notifications for the
 * action inbox, and the private liked-posts history.
 *
 * ## Which policies actually had to move
 *
 * Almost every query here is already scoped to the viewer's own id, and a
 * query filtering `author_id = <viewer>` or `user_id = <viewer>` satisfies its
 * table's policy by its own WHERE clause. Repeating the rule in those cases
 * would add nothing but a worse plan. The exceptions were found one at a time
 * by reading each policy rather than by assuming:
 *
 * - `bookmarks` is `USING (auth.uid() = user_id)`, for every command. The
 *   dashboard's bookmark stat has therefore only ever counted the viewer's own
 *   bookmarks of their own posts. See the note on `postStats`.
 * - `post_references` admits published posts, reviewers and co-authors, and
 *   *not* the author. See `postReferenceVisibleSql`.
 * - `posts` reached as an embed, where the status is unconstrained. A pending
 *   co-author invitation points at a draft, visible only because the invitee
 *   counts as a co-author.
 * - `profiles`, everywhere a name is shown.
 *
 * ## One behaviour reproduced rather than repaired
 *
 * The bookmark stat above. It is recorded as a finding: a migration that
 * quietly fixed it would be changing the product inside a refactor.
 *
 * The opportunity reads (talent profile, inquiries, fellowship applications,
 * saved and open fellowships) went with those products in the publishing
 * reset, Phase 2D. Their tables are still in the database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { postReferenceVisibleSql } from "@/lib/db/postVisibility";
import { visibleProfileJoin } from "@/lib/db/profileVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface DashboardPostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  content: string | null;
  excerpt: string | null;
  tags: string[] | null;
  content_kind: string | null;
  status: string;
  impression_count: number | null;
  view_count: number | null;
  read_count: number | null;
  created_at: string;
  published_at: string | null;
  post_authors: Array<{
    user_id: string;
    accepted_at: string | null;
    profile: { username: string | null; full_name: string | null } | null;
  }>;
}

export interface DashboardPostStats {
  referenceCounts: Record<string, number>;
  bookmarkCounts: Record<string, number>;
  likeCounts: Record<string, number>;
}

export interface DashboardRepository {
  /** Everything this member has written, newest first. */
  myPosts(viewerId: string): Promise<DashboardPostRow[]>;
  /**
   * The three per-post numbers the cards show, in one statement.
   *
   * Three PostgREST calls become one, and each keeps its own visibility rule:
   * they are three different tables with three different policies, not one
   * aggregate with a filter.
   */
  postStats(postIds: string[], viewerId: string): Promise<DashboardPostStats>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const MY_POSTS_SQL = `
  select
    p.id, p.author_id, p.title, p.slug, p.content, p.excerpt,
    to_jsonb(p.tags) as tags,
    p.content_kind, p.status,
    p.impression_count, p.view_count, p.read_count,
    p.created_at, p.published_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', a.user_id,
        'accepted_at', a.accepted_at,
        'profile', case when co.id is null then null else jsonb_build_object(
          'username', co.username,
          'full_name', co.full_name
        ) end
      ))
      from public.post_authors a
      ${visibleProfileJoin("co", "a.user_id", "$1")}
      where a.post_id = p.id
    ), '[]'::jsonb) as post_authors
  from public.posts p
  where p.author_id = $1::uuid
  order by p.created_at desc
`;

/**
 * Three counts, three different visibility rules, one round trip.
 *
 * Each branch keeps the rule its own table carries, which is why this is a
 * union of three scoped counts rather than one join. In particular the
 * bookmark branch is scoped to the viewer, because `bookmarks` is
 * `USING (auth.uid() = user_id)` and has always been.
 */
const POST_STATS_SQL = `
  with ids as (
    select (jsonb_array_elements_text($1::text::jsonb))::uuid as id
  )
  select
    'reference' as kind, r.post_id as post_id, count(*)::bigint as n
  from public.post_references r
  where r.post_id in (select id from ids)
    and ${postReferenceVisibleSql("r", "$2")}
  group by r.post_id

  union all
  select 'bookmark', b.post_id, count(*)::bigint
  from public.bookmarks b
  where b.post_id in (select id from ids)
    and b.user_id = $2::uuid
  group by b.post_id

  union all
  select 'like', l.post_id, l.like_count::bigint
  from public.post_like_counts l
  where l.post_id in (select id from ids)
`;

// ── Shared ───────────────────────────────────────────────────────────

function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
}

function tally(rowsIn: Array<{ post_id: string | null }>): Record<string, number> {
  return rowsIn.reduce<Record<string, number>>((acc, row) => {
    if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
    return acc;
  }, {});
}

const MY_POSTS_SELECT = `
      id, author_id, title, slug, content, excerpt, tags, content_kind, status, impression_count, view_count, read_count,
      created_at, published_at,
      post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))
      `;

// ── Supabase ─────────────────────────────────────────────────────────

export function createSupabaseDashboardRepository(
  supabase: SupabaseClient
): DashboardRepository {
  return {
    backend: "supabase",

    async myPosts(viewerId) {
      const result = await supabase
        .from("posts")
        .select(MY_POSTS_SELECT)
        .eq("author_id", viewerId)
        .order("created_at", { ascending: false });
      return rows<DashboardPostRow>(result, "dashboard posts");
    },

    async postStats(postIds) {
      if (postIds.length === 0) {
        return {
          referenceCounts: {},
          bookmarkCounts: {},
          likeCounts: {},
        };
      }

      const [references, bookmarks, likeRows] = await Promise.all([
        supabase.from("post_references").select("post_id").in("post_id", postIds),
        supabase.from("bookmarks").select("post_id").in("post_id", postIds),
        supabase
          .from("post_like_counts")
          .select("post_id, like_count")
          .in("post_id", postIds),
      ]);

      return {
        referenceCounts: tally(rows(references, "reference counts")),
        bookmarkCounts: tally(rows(bookmarks, "bookmark counts")),
        likeCounts: rows<{ post_id: string; like_count: number | null }>(
          likeRows,
          "like counts"
        ).reduce<Record<string, number>>((acc, row) => {
          acc[row.post_id] = row.like_count ?? 0;
          return acc;
        }, {}),
      };
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresDashboardRepository(
  executor: SqlExecutor
): DashboardRepository {
  return {
    backend: "postgres",

    async myPosts(viewerId) {
      return executor.query<DashboardPostRow>(MY_POSTS_SQL, [viewerId]);
    },

    async postStats(postIds, viewerId) {
      const empty = {
        referenceCounts: {},
        bookmarkCounts: {},
        likeCounts: {},
      };
      if (postIds.length === 0) return empty;

      const result = await executor.query<{
        kind: string;
        post_id: string | null;
        n: string | number;
      }>(POST_STATS_SQL, [JSON.stringify(postIds), viewerId]);

      const buckets: DashboardPostStats = {
        referenceCounts: {},
        bookmarkCounts: {},
        likeCounts: {},
      };
      const target: Record<string, Record<string, number>> = {
        reference: buckets.referenceCounts,
        bookmark: buckets.bookmarkCounts,
        like: buckets.likeCounts,
      };

      for (const row of result) {
        if (!row.post_id) continue;
        const bucket = target[row.kind];
        if (!bucket) continue;
        // count(*) is a bigint, which arrives as a string.
        bucket[row.post_id] = Number(row.n);
      }
      return buckets;
    },
  };
}
