import "server-only";

/**
 * Search, as PostgreSQL.
 *
 * Three business operations, one per surface, plus the tag sample the topic
 * list is derived from. No generic filter builder: the PostgREST grammar these
 * replace was itself the source of a correctness bug, and reproducing the
 * grammar rather than the intent would carry it forward.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## The visibility rule PostgREST was carrying
 *
 * `posts` is filtered to `status = 'published'` by these queries themselves,
 * so the posts policy adds nothing and the direct read returns the same rows.
 *
 * `profiles` is the exception and it is not a small one. Its policy hides
 * suspended members and honours `privacy_settings -> profile_visibility`, and
 * PostgREST applied that to the people search *and to every author embed*: a
 * post by a suspended author came back with a null author rather than with a
 * name. Both are reproduced here through `lib/db/profileVisibility.ts`, which
 * is why every method takes a server-resolved viewer id. Passing null is the
 * logged-out reader and is a valid answer, not a missing argument.
 *
 * ## Two things reproduced deliberately, both arguably wrong
 *
 * The overlay typeahead and the tag sample both apply LIMIT with no ORDER BY,
 * so which rows they return is whatever the plan plans. That is what the
 * PostgREST calls did, and changing it here would change what the command
 * palette shows and what counts as a trending topic. Both are recorded as
 * findings rather than fixed inside a migration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { likeContainsPattern, orIlikeFilter } from "@/lib/searchFilters";
import { profileVisibleSql, visibleProfileJoin } from "@/lib/db/profileVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface SearchPostResult {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  content_kind: string | null;
  published_at: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
  } | null;
}

/** The typeahead projection: no excerpt, no published_at, no university. */
export type SearchOverlayResult = Omit<
  SearchPostResult,
  "excerpt" | "published_at" | "profiles"
> & {
  profiles: { username: string; full_name: string | null } | null;
};

export interface SearchPersonResult {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

/** One published post's tags, which is all the topic count reads. */
export interface TagSampleRow {
  tags: string[] | null;
}

export interface SearchRepository {
  /** Command-palette typeahead: titles only. */
  overlayPosts(
    query: string,
    options: { viewerId: string | null; limit: number }
  ): Promise<SearchOverlayResult[]>;
  /** The search page's post results: title or excerpt, newest first. */
  posts(
    query: string,
    options: { viewerId: string | null; limit: number }
  ): Promise<SearchPostResult[]>;
  /** The search page's people results. Honours profile visibility. */
  people(
    query: string,
    options: { viewerId: string | null; limit: number }
  ): Promise<SearchPersonResult[]>;
  /** The sample the trending topics are counted from. */
  publishedTagSample(limit: number): Promise<TagSampleRow[]>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

/**
 * The typeahead used to carry a research exclusion twice over, once on `type`
 * and once on `content_kind`, with a `content_kind is null` escape so that
 * posts predating the column were not swallowed by it. None of that is
 * reachable: every row carries a canonical content_kind of 'post' or 'article'
 * and the database refuses any other value (20260915000006).
 *
 * That also settles a disagreement this file used to document: the typeahead
 * excluded research and the search page did not, so the two surfaces answered
 * differently for the same query. They now agree, because there is nothing to
 * disagree about.
 *
 * No ORDER BY, deliberately. See the note at the top of this file.
 */
const OVERLAY_SQL = `
  select
    p.id,
    p.title,
    p.slug,
    p.content_kind,
    case when a.id is null then null else jsonb_build_object(
      'full_name', a.full_name,
      'username', a.username
    ) end as profiles
  from public.posts p
  ${visibleProfileJoin("a", "p.author_id", "$3")}
  where p.status = 'published'
    and p.title ilike $1::text
  limit $2::int
`;

/**
 * Title or excerpt.
 *
 * `published_at desc` with no nulls clause, so nulls come first, as they did.
 */
const POSTS_SQL = `
  select
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.content_kind,
    p.published_at,
    case when a.id is null then null else jsonb_build_object(
      'username', a.username,
      'full_name', a.full_name,
      'university', a.university
    ) end as profiles
  from public.posts p
  ${visibleProfileJoin("a", "p.author_id", "$3")}
  where p.status = 'published'
    and (p.title ilike $1::text or p.excerpt ilike $1::text)
  order by p.published_at desc
  limit $2::int
`;

/**
 * The people search, with the profiles policy inlined as a WHERE clause: here
 * an invisible profile is not a result at all, which is what RLS did to this
 * query.
 *
 * No ORDER BY, as before.
 */
const PEOPLE_SQL = `
  select
    p.id,
    p.username,
    p.full_name,
    p.university,
    p.avatar_url
  from public.profiles p
  where (
      p.username ilike $1::text
      or p.full_name ilike $1::text
      or p.university ilike $1::text
    )
    and ${profileVisibleSql("p", "$3")}
  limit $2::int
`;

/**
 * The tag sample. Aggregated in TypeScript rather than in SQL, because the
 * counting key is `formatTagLabel`, which strips a leading hash so that
 * "#africa" and "africa" are one topic. Moving the aggregation into SQL would
 * mean reimplementing that in two languages.
 *
 * `to_jsonb` because a text[] does not parse back without type OIDs.
 */
const TAG_SAMPLE_SQL = `
  select to_jsonb(p.tags) as tags
  from public.posts p
  where p.status = 'published'
  limit $1::int
`;

// ── Shared mapping ───────────────────────────────────────────────────

/** PostgREST returns a one-to-one embed as an object or a one-element array
 *  depending on how it resolved the relationship. Both callers want the object. */
export function firstAuthor<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
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

// ── Supabase ─────────────────────────────────────────────────────────

const OVERLAY_SELECT =
  "id, title, slug, content_kind, profiles!posts_author_id_fkey(full_name, username)";

const POST_SELECT =
  "id, title, slug, excerpt, content_kind, published_at, profiles!posts_author_id_fkey(username, full_name, university)";

export function createSupabaseSearchRepository(
  supabase: SupabaseClient
): SearchRepository {
  return {
    backend: "supabase",

    async overlayPosts(query, options) {
      const request = supabase
        .from("posts")
        .select(OVERLAY_SELECT)
        .eq("status", "published")
        .ilike("title", likeContainsPattern(query));

      const result = await request.limit(options.limit);
      return rows<Record<string, unknown>>(result, "overlay search failed").map(
        (row) =>
          ({
            ...row,
            profiles: firstAuthor(row.profiles),
          }) as unknown as SearchOverlayResult
      );
    },

    async posts(query, options) {
      const result = await supabase
        .from("posts")
        .select(POST_SELECT)
        .eq("status", "published")
        .or(orIlikeFilter(["title", "excerpt"], query))
        .order("published_at", { ascending: false })
        .limit(options.limit);

      return rows<Record<string, unknown>>(result, "post search failed").map(
        (row) =>
          ({
            ...row,
            profiles: firstAuthor(row.profiles),
          }) as unknown as SearchPostResult
      );
    },

    async people(query, options) {
      const result = await supabase
        .from("profiles")
        .select("id, username, full_name, university, avatar_url")
        .or(orIlikeFilter(["username", "full_name", "university"], query))
        .limit(options.limit);

      return rows<SearchPersonResult>(result, "people search failed");
    },

    async publishedTagSample(limit) {
      const result = await supabase
        .from("posts")
        .select("tags")
        .eq("status", "published")
        .limit(limit);

      return rows<TagSampleRow>(result, "topic list failed");
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresSearchRepository(
  executor: SqlExecutor
): SearchRepository {
  return {
    backend: "postgres",

    async overlayPosts(query, options) {
      const result = await executor.query<Record<string, unknown>>(OVERLAY_SQL, [
        likeContainsPattern(query),
        options.limit,
        options.viewerId,
      ]);
      return result as unknown as SearchOverlayResult[];
    },

    async posts(query, options) {
      const result = await executor.query<Record<string, unknown>>(POSTS_SQL, [
        likeContainsPattern(query),
        options.limit,
        options.viewerId,
      ]);
      return result as unknown as SearchPostResult[];
    },

    async people(query, options) {
      const result = await executor.query<SearchPersonResult>(PEOPLE_SQL, [
        likeContainsPattern(query),
        options.limit,
        options.viewerId,
      ]);
      return result;
    },

    async publishedTagSample(limit) {
      const result = await executor.query<{ tags: unknown }>(TAG_SAMPLE_SQL, [limit]);
      return result.map((row) => ({ tags: toTags(row.tags) }));
    },
  };
}
