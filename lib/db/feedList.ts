import "server-only";

/**
 * The feed's post selection, as PostgreSQL.
 *
 * `lib/db/feed.ts` already moved the *hydration*: the counts and authors every
 * card needs once the ids are known. This is the other half, the query that
 * decides which posts a slice of the feed contains.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## One operation, not a query builder
 *
 * Every list in `lib/feedData.ts` is the same selection with a different set of
 * restrictions, so this is one business operation, `listPosts`, taking those
 * restrictions as named criteria. The criteria are the dimensions the feed
 * actually varies (whose posts, which kind, how recent, who is excluded, where
 * the cursor is), each a fact about the product rather than a PostgREST verb.
 * Nothing here takes a column name, an operator, or a fragment of SQL from its
 * caller.
 *
 * The publishing reset, Phase 2F, removed the criteria only retired feed modes
 * used: co-author credit matching, topic-subscription overlap, the
 * citation-only arm, the read-count ordering and the identity-only projection.
 * Phase 2I removed the research exclusion every feed query used to carry, and
 * the columns a card no longer reads: the legacy `type`, the `article_format`
 * genre, the response parent, and the research document fields.
 *
 * ## The reader has always been the admin client
 *
 * `fetchFeedPage` builds its reader from `SUPABASE_SERVICE_ROLE_KEY`, which is
 * set in production, so RLS was never applied to these queries and the direct
 * port sees the same rows. The queries filter `status = 'published'`
 * themselves, which is what actually keeps unpublished work out. Stated here
 * because the absence of a policy check is what a missed one looks like.
 *
 * ## The keyset cursor
 *
 * The cursor was a PostgREST `or=` filter spelling out
 * `published_at < x OR (published_at = x AND id < y)`. That is the row
 * comparison `(published_at, id) < (x, y)`, and it is written as one here: the
 * same predicate, and no longer assembled by interpolating values into a
 * string.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { toTimestampString } from "@/lib/db/postgres/normalise";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface FeedPostRow {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  content_kind: string | null;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  word_count: number | null;
  cover_image_url: string | null;
  author_id: string | null;
}

export interface FeedCursor {
  publishedAt: string;
  id: string;
}

export interface FeedListCriteria {
  /** One of the top-level content kinds, or null for all of them. */
  contentKind: string | null;
  /** Earliest `published_at` to admit, or null for no floor. */
  cutoff: string | null;
  /** Restrict to these authors. Null is no restriction; an empty array is
   *  never passed, because the caller returns an empty page instead. */
  authorIds: readonly string[] | null;
  excludedAuthorIds: readonly string[];
  excludedPostIds: readonly string[];
  cursor: FeedCursor | null;
  offset: number;
  limit: number;
}

export interface FeedListRepository {
  /** One slice of the feed, newest first, as ids and card fields. */
  listPosts(criteria: FeedListCriteria): Promise<FeedPostRow[]>;
  /**
   * Posts crediting any of these people as an accepted author.
   *
   * The feed excludes a blocked person's work, and filtering on
   * `posts.author_id` alone would let them back in through a co-authored
   * publication. This is that gap, computed once per page and fed to
   * `excludedPostIds`.
   */
  postIdsCreditedTo(authorIds: readonly string[]): Promise<string[]>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

/**
 * The two `timestamptz` columns, as the strings this contract promises.
 *
 * `tags` is already `to_jsonb` and the numeric columns arrive as numbers, so
 * these two are the whole gap. postgres.js hands back a Date for a timestamp
 * and `FeedPostRow` says string. That difference is not cosmetic here: the
 * caller feeds `published_at` straight back in as a keyset cursor, the
 * PostgREST arm interpolates the cursor into an `or=` filter, and a Date
 * stringifies there as "Wed Sep 09 2026 11:18:00 GMT+0100 (West Africa Time)",
 * which PostgreSQL rejects with 22007. Live parity caught it; no type did.
 *
 * Null stays null rather than becoming a string.
 */
function normaliseRows<T>(rows: ReadonlyArray<Record<string, unknown>>): T[] {
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const key of ["created_at", "published_at"]) {
      if (key in next) next[key] = toTimestampString(next[key]);
    }
    return next as T;
  });
}

/**
 * Every restriction is a nullable parameter tested in the predicate, so the
 * statement is one constant rather than a string assembled per request.
 *
 * The array parameters arrive as JSON text: `postgres.js` runs with
 * `fetch_types: false` and cannot serialise an array, and the `::text::jsonb`
 * double cast is what stops it inferring an OID and encoding an
 * already-encoded string a second time.
 *
 *  $1  content kind                 $6  cursor published_at
 *  $2  cutoff                       $7  cursor id
 *  $3  author ids (json)            $8  offset
 *  $4  excluded author ids (json)   $9  limit
 *  $5  excluded post ids (json)
 */
const LIST_SQL = `
  select
    p.id, p.title, p.slug, p.excerpt,
    p.content_kind, to_jsonb(p.tags) as tags,
    p.created_at, p.published_at, p.view_count, p.impression_count,
    p.read_count, p.word_count, p.cover_image_url, p.author_id
  from public.posts p
  where p.status = 'published'
    and ($1::text is null or p.content_kind = $1::text)
    and ($2::timestamptz is null or p.published_at >= $2::timestamptz)
    and (
      $3::text is null
      or p.author_id in (select (jsonb_array_elements_text($3::text::jsonb))::uuid)
    )
    and (
      $4::text is null
      or p.author_id is null
      or p.author_id not in (
        select (jsonb_array_elements_text($4::text::jsonb))::uuid
      )
    )
    and (
      $5::text is null
      or p.id not in (select (jsonb_array_elements_text($5::text::jsonb))::uuid)
    )
    and (
      $6::timestamptz is null
      or (p.published_at, p.id) < ($6::timestamptz, $7::uuid)
    )
  order by p.published_at desc, p.id desc
  offset $8::int
  limit $9::int
`;

const CREDITED_POST_IDS_SQL = `
  select distinct a.post_id
  from public.post_authors a
  where a.accepted_at is not null
    and a.user_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
`;

/** `null` for "do not restrict", never an empty array: an empty `in` list is
 *  the one that quietly matches everything. */
function listParam(values: readonly string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  return JSON.stringify([...values]);
}

// ── Supabase ─────────────────────────────────────────────────────────

const POST_SELECT =
  "id, title, slug, excerpt, content_kind, tags, created_at, published_at, view_count, impression_count, read_count, word_count, cover_image_url, author_id";

export function createSupabaseFeedListRepository(
  supabase: SupabaseClient
): FeedListRepository {
  return {
    backend: "supabase",

    async postIdsCreditedTo(authorIds) {
      if (authorIds.length === 0) return [];
      const { data, error } = await supabase
        .from("post_authors")
        .select("post_id")
        .in("user_id", [...authorIds])
        .not("accepted_at", "is", null);

      if (error) {
        const failure = new Error(
          `credited post ids failed: ${error.message}`
        ) as Error & { code?: string };
        if (typeof error.code === "string" && error.code) {
          failure.code = error.code;
        }
        throw failure;
      }

      return Array.from(
        new Set(
          ((data ?? []) as Array<{ post_id: string }>)
            .map((row) => row.post_id)
            .filter(Boolean)
        )
      );
    },

    async listPosts(criteria) {
      let query = supabase
        .from("posts")
        .select(POST_SELECT)
        .eq("status", "published");

      if (criteria.contentKind) {
        query = query.eq("content_kind", criteria.contentKind);
      }
      if (criteria.cutoff) {
        query = query.gte("published_at", criteria.cutoff);
      }
      if (criteria.excludedAuthorIds.length > 0) {
        query = query.not(
          "author_id",
          "in",
          `(${criteria.excludedAuthorIds.join(",")})`
        );
      }
      if (criteria.excludedPostIds.length > 0) {
        // A blocked user can be the primary author or an accepted co-author.
        // The latter needs an id anti-filter because PostgREST does not expose
        // a reliable NOT-EXISTS relation filter in this query shape. Chunked,
        // because the URL has a length.
        for (let index = 0; index < criteria.excludedPostIds.length; index += 100) {
          query = query.not(
            "id",
            "in",
            `(${criteria.excludedPostIds.slice(index, index + 100).join(",")})`
          );
        }
      }
      if (criteria.authorIds) {
        query = query.in("author_id", [...criteria.authorIds]);
      }
      if (criteria.cursor) {
        query = query.or(
          `published_at.lt.${criteria.cursor.publishedAt},and(published_at.eq.${criteria.cursor.publishedAt},id.lt.${criteria.cursor.id})`
        );
      }

      query = query
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });

      const { data, error } = criteria.offset
        ? await query.range(
            criteria.offset,
            criteria.offset + criteria.limit - 1
          )
        : await query.limit(criteria.limit);

      if (error) {
        // The database's own code has to survive the wrapper: FeedDataError
        // reads it, and it is what lets a caller tell an outage from an empty
        // feed. A plain Error drops it, and the feed then looks like a feed
        // with nothing in it.
        const failure = new Error(`feed list failed: ${error.message}`) as Error & {
          code?: string;
        };
        if (typeof error.code === "string" && error.code) {
          failure.code = error.code;
        }
        throw failure;
      }
      return (data ?? []) as unknown as FeedPostRow[];
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresFeedListRepository(
  executor: SqlExecutor
): FeedListRepository {
  return {
    backend: "postgres",

    async postIdsCreditedTo(authorIds) {
      if (authorIds.length === 0) return [];
      const rows = await executor.query<{ post_id: string }>(
        CREDITED_POST_IDS_SQL,
        [JSON.stringify([...authorIds])]
      );
      return rows.map((row) => row.post_id);
    },

    async listPosts(criteria) {
      return normaliseRows<FeedPostRow>(await executor.query(LIST_SQL, [
        criteria.contentKind,
        criteria.cutoff,
        listParam(criteria.authorIds),
        listParam(criteria.excludedAuthorIds),
        listParam(criteria.excludedPostIds),
        criteria.cursor?.publishedAt ?? null,
        criteria.cursor?.id ?? null,
        criteria.offset,
        criteria.limit,
      ]));
    },
  };
}
