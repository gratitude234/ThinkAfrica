import "server-only";

/**
 * The feed's post selection, as PostgreSQL.
 *
 * `lib/db/feed.ts` already moved the *hydration*: the counts, authors and
 * co-authors every card needs once the ids are known. This is the other half,
 * the query that decides which posts a slice of the feed contains.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## One operation, not a query builder
 *
 * Every list in `lib/feedData.ts` is the same selection with a different set of
 * restrictions: two projections, two orderings, and a WHERE clause assembled
 * from a fixed vocabulary. So this is one business operation, `listPosts`,
 * taking those restrictions as named criteria.
 *
 * That is deliberately not a generic filter builder. The criteria are the
 * dimensions the feed actually varies (whose posts, which kind, how recent,
 * which topics, who is excluded, where the cursor is), each of them a fact
 * about the product rather than a PostgREST verb. Nothing here takes a column
 * name, an operator, or a fragment of SQL from its caller.
 *
 * ## The reader has always been the admin client
 *
 * `fetchFeedPage` builds its reader from `SUPABASE_SERVICE_ROLE_KEY`, which is
 * set in production, so RLS was never applied to these queries and the direct
 * port sees the same rows. The queries filter `status = 'published'`
 * themselves, which is what actually keeps unpublished work out. Stated here
 * because the absence of a policy check is what a missed one looks like.
 *
 * ## Two translations worth naming
 *
 * The keyset cursor was a PostgREST `or=` filter spelling out
 * `published_at < x OR (published_at = x AND id < y)`. That is the row
 * comparison `(published_at, id) < (x, y)`, and it is written as one here: the
 * same predicate, and no longer assembled by interpolating values into a
 * string.
 *
 * The co-author credit filter was `post_authors!inner(...)` with a filter on
 * the embed. An inner embed keeps a post when at least one credit matches,
 * without multiplying the post by its credits, so the faithful translation is
 * `exists`, not a join.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface FeedPostRow {
  id: string;
  title: string | null;
  slug: string;
  in_response_to: string | null;
  excerpt: string | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  word_count: number | null;
  cover_image_url: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  document_original_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
  author_id: string | null;
  topic_keys?: string[] | null;
}

export interface FeedCursor {
  publishedAt: string;
  id: string;
}

export interface FeedListCriteria {
  /** The sentinel that matches nothing when Research is enabled. */
  researchTypeExclusion: string;
  /** One of the three top-level content kinds, or null for all of them. */
  contentKind: string | null;
  /** Earliest `published_at` to admit, or null for no floor. */
  cutoff: string | null;
  /** Restrict to these authors. Null is no restriction; an empty array is
   *  never passed, because the caller returns an empty page instead. */
  authorIds: readonly string[] | null;
  /** Keep posts carrying an accepted credit for any of these people. */
  coauthorUserIds: readonly string[] | null;
  /** Keep posts whose topic keys overlap these. */
  topicKeys: readonly string[] | null;
  /** Keep only posts with a citation id, for the reviewed-evergreen arm. */
  requireCitation: boolean;
  /** Keep only responses, for the responses shelf. */
  onlyResponses: boolean;
  excludedAuthorIds: readonly string[];
  excludedPostIds: readonly string[];
  cursor: FeedCursor | null;
  /** `recent` is published_at then id. `well_read` puts read_count first. */
  order: "recent" | "well_read";
  /** Whether the projection carries `topic_keys`. */
  includeTopicKeys: boolean;
  /**
   * How much of each row to read.
   *
   * `card` is everything a feed card renders. `identity` is enough to work
   * out where the ranked pool ends and which ids the evergreen arms claimed,
   * and nothing else: the tail needs both facts and none of the content behind
   * them, and reading it would be 160 rows of article metadata fetched and
   * dropped on every page past the ranking. There is a test for that.
   */
  projection: "card" | "identity";
  offset: number;
  limit: number;
}

/** A post plus the subscribed credits that matched it. */
export type FeedPostWithCredits = FeedPostRow & {
  subscription_author_credits:
    | Array<{ user_id?: string; accepted_at?: string | null }>
    | { user_id?: string; accepted_at?: string | null }
    | null;
};

export interface FeedListRepository {
  /** One slice of the feed, as ids and card fields. */
  listPosts(criteria: FeedListCriteria): Promise<FeedPostRow[]>;
  /**
   * The same slice, restricted to posts carrying an accepted credit for one
   * of `coauthorUserIds`, and carrying those credits back with it.
   *
   * A separate operation rather than a flag on `listPosts`, because the
   * caller needs to know *which* subscribed author matched in order to label
   * the card. `listPosts` deliberately does not return that: an `exists` is
   * cheaper and is the right shape when the answer is only yes or no.
   */
  listPostsWithCredits(
    criteria: FeedListCriteria
  ): Promise<FeedPostWithCredits[]>;
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
 * Enough of a candidate row to work out where the pool ends. Deliberately not
 * a subset anyone can choose: two named projections, because the narrow one
 * exists for one reason and widening it silently would undo it.
 */
const IDENTITY_COLUMNS = `
    p.id, p.published_at, p.read_count, p.citation_id`;

const BASE_COLUMNS = `
    p.id, p.title, p.slug, p.in_response_to, p.excerpt, p.type,
    p.content_kind, p.article_format, to_jsonb(p.tags) as tags,
    p.created_at, p.published_at, p.view_count, p.impression_count,
    p.read_count, p.word_count, p.cover_image_url, p.citation_id,
    p.published_version_id, p.document_original_name, p.document_mime_type,
    p.document_size_bytes, p.author_id`;

/**
 * Every restriction is a nullable parameter tested in the predicate, so the
 * statement is one constant per projection and ordering rather than a string
 * assembled per request.
 *
 * The array parameters arrive as JSON text: `postgres.js` runs with
 * `fetch_types: false` and cannot serialise an array, and the `::text::jsonb`
 * double cast is what stops it inferring an OID and encoding an
 * already-encoded string a second time.
 *
 *  $1  research type exclusion       $8  excluded post ids (json)
 *  $2  content kind                  $9  cursor published_at
 *  $3  cutoff                       $10  cursor id
 *  $4  author ids (json)            $11  offset
 *  $5  co-author user ids (json)    $12  limit
 *  $6  topic keys (json)
 *  $7  excluded author ids (json)   $13  require citation
 *                                  $14  only responses
 */
function listSql(
  order: "recent" | "well_read",
  includeTopicKeys: boolean,
  projection: "card" | "identity" = "card"
): string {
  const columns =
    projection === "identity"
      ? IDENTITY_COLUMNS
      : includeTopicKeys
        ? `${BASE_COLUMNS},\n    to_jsonb(p.topic_keys) as topic_keys`
        : BASE_COLUMNS;

  const ordering =
    order === "well_read"
      ? "order by p.read_count desc, p.published_at desc, p.id desc"
      : "order by p.published_at desc, p.id desc";

  return `
  select${columns}
  from public.posts p
  where p.status = 'published'
    and p.type <> $1::text
    and ($2::text is null or p.content_kind = $2::text)
    and ($3::timestamptz is null or p.published_at >= $3::timestamptz)
    and (
      $4::text is null
      or p.author_id in (select (jsonb_array_elements_text($4::text::jsonb))::uuid)
    )
    and (
      $5::text is null
      or exists (
        select 1 from public.post_authors credit
        where credit.post_id = p.id
          and credit.accepted_at is not null
          and credit.user_id in (
            select (jsonb_array_elements_text($5::text::jsonb))::uuid
          )
      )
    )
    and (
      $6::text is null
      or p.topic_keys && array(select jsonb_array_elements_text($6::text::jsonb))
    )
    and (
      $7::text is null
      or p.author_id is null
      or p.author_id not in (
        select (jsonb_array_elements_text($7::text::jsonb))::uuid
      )
    )
    and (
      $8::text is null
      or p.id not in (select (jsonb_array_elements_text($8::text::jsonb))::uuid)
    )
    and (
      $9::timestamptz is null
      or (p.published_at, p.id) < ($9::timestamptz, $10::uuid)
    )
    and ($13::boolean is false or p.citation_id is not null)
    and ($14::boolean is false or p.in_response_to is not null)
  ${ordering}
  offset $11::int
  limit $12::int
`;
}

/**
 * The co-author arm, which needs the matching credits back as well as the post.
 *
 * Same predicate as `listSql`, with the credits aggregated rather than merely
 * tested. Built by wrapping that statement so the two can never disagree about
 * which posts qualify: the aggregate is a projection over the same rows, not a
 * second definition of them.
 */
const CREDITS_SQL = `
  select
    listed.*,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', credit.user_id,
        'accepted_at', credit.accepted_at
      ))
      from public.post_authors credit
      where credit.post_id = listed.id
        and credit.accepted_at is not null
        and credit.user_id in (
          select (jsonb_array_elements_text($5::text::jsonb))::uuid
        )
    ), '[]'::jsonb) as subscription_author_credits
  from (${listSql("recent", false)}) as listed
`;

const CREDITED_POST_IDS_SQL = `
  select distinct a.post_id
  from public.post_authors a
  where a.accepted_at is not null
    and a.user_id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
`;

/** Four statements, built once. The shape never depends on a request. */
const STATEMENTS = {
  recent: listSql("recent", false),
  recentWithTopics: listSql("recent", true),
  wellRead: listSql("well_read", false),
  wellReadWithTopics: listSql("well_read", true),
  recentIdentity: listSql("recent", false, "identity"),
  wellReadIdentity: listSql("well_read", false, "identity"),
} as const;

function statementFor(criteria: FeedListCriteria): string {
  if (criteria.projection === "identity") {
    // topic_keys is never part of the identity projection: the arms that ask
    // for it are the ones that read whole cards.
    return criteria.order === "well_read"
      ? STATEMENTS.wellReadIdentity
      : STATEMENTS.recentIdentity;
  }
  if (criteria.order === "well_read") {
    return criteria.includeTopicKeys
      ? STATEMENTS.wellReadWithTopics
      : STATEMENTS.wellRead;
  }
  return criteria.includeTopicKeys
    ? STATEMENTS.recentWithTopics
    : STATEMENTS.recent;
}

/** `null` for "do not restrict", never an empty array: an empty `in` list is
 *  the one that quietly matches everything. */
function listParam(values: readonly string[] | null | undefined): string | null {
  if (!values || values.length === 0) return null;
  return JSON.stringify([...values]);
}

// ── Supabase ─────────────────────────────────────────────────────────

const POST_SELECT =
  "id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, created_at, published_at, view_count, impression_count, read_count, word_count, cover_image_url, citation_id, published_version_id, document_original_name, document_mime_type, document_size_bytes, author_id";

const POST_SELECT_WITH_TOPIC_KEYS = `${POST_SELECT}, topic_keys`;

const IDENTITY_SELECT = "id, published_at, read_count, citation_id";

const COAUTHOR_SELECT = `${POST_SELECT}, subscription_author_credits:post_authors!inner(user_id, accepted_at)`;

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

    async listPostsWithCredits(criteria) {
      return (await this.listPosts(criteria)) as unknown as FeedPostWithCredits[];
    },

    async listPosts(criteria) {
      const select =
        criteria.projection === "identity"
          ? IDENTITY_SELECT
          : criteria.coauthorUserIds
            ? COAUTHOR_SELECT
            : criteria.includeTopicKeys
              ? POST_SELECT_WITH_TOPIC_KEYS
              : POST_SELECT;

      let query = supabase
        .from("posts")
        .select(select)
        .eq("status", "published")
        .neq("type", criteria.researchTypeExclusion);

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
      if (criteria.coauthorUserIds) {
        query = query
          .in("subscription_author_credits.user_id", [...criteria.coauthorUserIds])
          .not("subscription_author_credits.accepted_at", "is", null);
      }
      if (criteria.topicKeys) {
        query = query.overlaps("topic_keys", [...criteria.topicKeys]);
      }
      if (criteria.requireCitation) {
        query = query.not("citation_id", "is", null);
      }
      if (criteria.onlyResponses) {
        query = query.not("in_response_to", "is", null);
      }
      if (criteria.cursor) {
        query = query.or(
          `published_at.lt.${criteria.cursor.publishedAt},and(published_at.eq.${criteria.cursor.publishedAt},id.lt.${criteria.cursor.id})`
        );
      }

      if (criteria.order === "well_read") {
        query = query.order("read_count", { ascending: false });
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

    async listPostsWithCredits(criteria) {
      if (!criteria.coauthorUserIds) {
        // The operation is defined by the restriction. Without it there are no
        // credits to report, and returning posts with an empty credit list
        // would look like "matched nothing" rather than "asked wrongly".
        throw new Error(
          "listPostsWithCredits requires coauthorUserIds; use listPosts instead"
        );
      }
      return executor.query<FeedPostWithCredits>(CREDITS_SQL, [
        criteria.researchTypeExclusion,
        criteria.contentKind,
        criteria.cutoff,
        listParam(criteria.authorIds),
        listParam(criteria.coauthorUserIds),
        listParam(criteria.topicKeys),
        listParam(criteria.excludedAuthorIds),
        listParam(criteria.excludedPostIds),
        criteria.cursor?.publishedAt ?? null,
        criteria.cursor?.id ?? null,
        criteria.offset,
        criteria.limit,
        criteria.requireCitation,
        criteria.onlyResponses,
      ]);
    },

    async listPosts(criteria) {
      return executor.query<FeedPostRow>(statementFor(criteria), [
        criteria.researchTypeExclusion,
        criteria.contentKind,
        criteria.cutoff,
        listParam(criteria.authorIds),
        listParam(criteria.coauthorUserIds),
        listParam(criteria.topicKeys),
        listParam(criteria.excludedAuthorIds),
        listParam(criteria.excludedPostIds),
        criteria.cursor?.publishedAt ?? null,
        criteria.cursor?.id ?? null,
        criteria.offset,
        criteria.limit,
        criteria.requireCitation,
        criteria.onlyResponses,
      ]);
    },
  };
}
