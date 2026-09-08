import "server-only";

/**
 * The public profile record's reads, as PostgreSQL.
 *
 * `lib/db/profilePage.ts` covers the profile header and its publication list.
 * This covers the record itself: the counts strip, the paginated entry list
 * and its hydration, and the topic index. Both are loaded by the same public
 * page, so neither on its own gets a logged-out profile off PostgREST.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## Why a direct read here exposes nothing new
 *
 * `profile_record_entries` is a view whose own definition filters
 * `status = 'published'`, on both branches of its union. It is a public
 * projection by construction rather than by policy, so reading it without RLS
 * returns the same rows RLS was already letting through. That is the argument,
 * and it is worth stating plainly because it does not generalise: it holds for
 * this relation because of what the view selects, not because the migration
 * needs it to.
 *
 * The two post reads are the same story from the other side. `topicPosts`
 * returns `status` rather than filtering on it, because the caller filters in
 * TypeScript and the row still has to count against the scan cap either way.
 * Removing rows in SQL that the caller was going to drop anyway would change
 * how much history one profile view reads, which is the one thing that cap
 * exists to fix.
 *
 * ## The summary function is tried twice, on both backends
 *
 * `loadProfileRecordSummary` asks for `_v2` and falls back to v1 when the
 * function is absent, which is a deployment seam rather than indecision. The
 * PostgreSQL side reproduces it exactly, matching SQLSTATE `42883`
 * (`undefined_function`) where the PostgREST side matches `PGRST202`. Hard
 * coding "call v1, v2 does not exist" would be true of production today and
 * silently wrong the morning 20260907000001 is applied.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

/** One row of `profile_record_entries`, unchanged from what the caller maps. */
export interface ProfileRecordEntryRow {
  profile_id: string;
  entry_id: string;
  entry_kind: string;
  occurred_at: string;
  is_coauthor: boolean;
  source_backed: boolean;
  citable: boolean;
}

export interface ProfileRecordPostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  in_response_to: string | null;
  excerpt: string | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
  post_authors?: Array<{
    user_id: string;
    accepted_at: string | null;
    profile:
      | { username: string; full_name: string | null }
      | Array<{ username: string; full_name: string | null }>
      | null;
  }>;
}

export interface ProfileTopicPostRow {
  id: string;
  author_id: string;
  in_response_to: string | null;
  tags: string[] | null;
  type: string;
  published_at?: string | null;
  created_at?: string | null;
  status?: string;
}

export interface ProfileRecordEntryQuery {
  profileId: string;
  /**
   * The entry kinds to keep, or `null` for every kind. Resolved by the caller,
   * because the mapping from a filter name to a set of kinds depends on
   * whether research is being shown and that is the caller's question.
   */
  kinds: string[] | null;
  /** `false` adds `entry_kind <> 'research'`, as the record view's own does. */
  includeResearch: boolean;
  /** `null` means the quality filter is not applied at all, not "false". */
  sourceBacked: boolean | null;
  citable: boolean | null;
  /**
   * Restricts to these entry ids. `null` is no restriction. An empty array
   * never reaches here: the caller returns an empty page instead, because an
   * empty `in` list is the one that quietly matches everything.
   */
  entryIds: string[] | null;
  start: number;
  pageSize: number;
}

export interface ProfileRecordEntryPage {
  entries: ProfileRecordEntryRow[];
  /** Rows matching the filters before pagination, as `count: "exact"` gave. */
  totalCount: number;
}

export interface ProfileRecordRepository {
  /**
   * The counts strip, as the database function returns it. The payload is
   * passed through unread: `normalizeProfileRecordSummary` owns its shape and
   * already tolerates both a bare row and a single-row array, which is the
   * difference between the two transports.
   */
  recordSummary(profileId: string, includeResearch: boolean): Promise<unknown>;
  entries(query: ProfileRecordEntryQuery): Promise<ProfileRecordEntryPage>;
  hydratePublications(postIds: string[]): Promise<ProfileRecordPostRow[]>;
  topicPosts(
    profileId: string,
    limit: number
  ): Promise<{ owned: ProfileTopicPostRow[]; coauthored: ProfileTopicPostRow[] }>;
}

// ── SQL ──────────────────────────────────────────────────────────────

/**
 * Every optional filter is a nullable parameter tested in the predicate rather
 * than a fragment concatenated in, so the statement is one constant and the
 * plan is shared. `$3` and `$6` arrive as JSON text because postgres.js runs
 * with `fetch_types: false` and so cannot serialise an array parameter; the
 * `::text::jsonb` double cast is what stops it inferring an OID and encoding
 * an already-encoded string a second time.
 *
 * `count(*) over ()` reproduces PostgREST's `count: "exact"`: the total before
 * `limit`, computed in the same pass rather than in a second statement that
 * could see a different set of rows.
 *
 * The ordering carries no `nulls` clause because the PostgREST call it
 * replaces carries none either, so both get PostgreSQL's default of nulls
 * first under `desc`. Spelling it out here would be a change, not a
 * clarification.
 */
const ENTRIES_SQL = `
  select
    e.profile_id,
    e.entry_id,
    e.entry_kind,
    e.occurred_at,
    e.is_coauthor,
    e.source_backed,
    e.citable,
    count(*) over () as total_count
  from public.profile_record_entries e
  where e.profile_id = $1::uuid
    and ($2::boolean or e.entry_kind <> 'research')
    and (
      $3::text is null
      or e.entry_kind in (select jsonb_array_elements_text($3::text::jsonb))
    )
    and ($4::boolean is null or e.source_backed = $4::boolean)
    and ($5::boolean is null or e.citable = $5::boolean)
    and (
      $6::text is null
      or e.entry_id in (
        select (jsonb_array_elements_text($6::text::jsonb))::uuid
      )
    )
  order by e.occurred_at desc, e.entry_id desc
  limit $7::int
  offset $8::int
`;

/**
 * The co-author embed is a `jsonb_agg` rather than a join, so one post never
 * arrives as several rows. `left join` on the profile matches what PostgREST
 * does for a to-one embed: a missing profile is a null `profile`, not a
 * dropped author, and the caller already skips those.
 *
 * `to_jsonb(p.tags)` because a `text[]` does not parse back without type OIDs.
 */
const HYDRATE_SQL = `
  select
    p.id,
    p.author_id,
    p.title,
    p.slug,
    p.in_response_to,
    p.excerpt,
    p.type,
    p.content_kind,
    p.article_format,
    p.citation_id,
    p.published_version_id,
    p.created_at,
    p.published_at,
    p.cover_image_url,
    to_jsonb(p.tags) as tags,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', pa.user_id,
            'accepted_at', pa.accepted_at,
            'profile', case
              when pr.id is null then null
              else jsonb_build_object(
                'username', pr.username,
                'full_name', pr.full_name
              )
            end
          )
        )
        from public.post_authors pa
        left join public.profiles pr on pr.id = pa.user_id
        where pa.post_id = p.id
      ),
      '[]'::jsonb
    ) as post_authors
  from public.posts p
  where p.id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
`;

const OWNED_TOPIC_SQL = `
  select
    p.id,
    p.author_id,
    p.in_response_to,
    to_jsonb(p.tags) as tags,
    p.type,
    p.published_at,
    p.created_at
  from public.posts p
  where p.author_id = $1::uuid
    and p.status = 'published'
  order by p.published_at desc nulls last, p.created_at desc
  limit $2::int
`;

/**
 * `join` rather than `left join`, which is the one place this is narrower than
 * the embed it replaces. PostgREST would return a row with a null post and the
 * caller would skip it, still spending one of the scan cap's slots.
 * `post_authors.post_id` is a foreign key to `posts`, so the two cannot differ
 * unless that constraint is gone, and a query quietly returning fewer rows is
 * the way that would show up.
 *
 * `status` is selected and not filtered on, because the caller filters it and
 * the cap is meant to bound how much history is read, not how much survives.
 */
const COAUTHORED_TOPIC_SQL = `
  select
    p.id,
    p.author_id,
    p.in_response_to,
    to_jsonb(p.tags) as tags,
    p.type,
    p.published_at,
    p.created_at,
    p.status
  from public.post_authors pa
  join public.posts p on p.id = pa.post_id
  where pa.user_id = $1::uuid
    and pa.accepted_at is not null
  order by pa.accepted_at desc
  limit $2::int
`;

/** PostgreSQL's `undefined_function`. The PostgREST twin is `PGRST202`. */
const UNDEFINED_FUNCTION = "42883";

/**
 * PostgREST's code for "no such function in the schema cache", plus the
 * shapes that absence takes on versions that report it without a code. Kept
 * narrow enough to mean the same fact rather than to swallow query failure.
 */
const PGRST_FUNCTION_NOT_FOUND = "PGRST202";

function isMissingFunction(
  error: { code?: string | null; message?: string | null } | null
): boolean {
  if (!error) return false;
  if (error.code === PGRST_FUNCTION_NOT_FOUND) return true;
  return /could not find the function|does not exist/i.test(error.message ?? "");
}

function isUndefinedFunction(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === UNDEFINED_FUNCTION;
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

// ── Supabase ─────────────────────────────────────────────────────────

const ENTRY_COLUMNS =
  "profile_id, entry_id, entry_kind, occurred_at, is_coauthor, source_backed, citable";

const HYDRATE_COLUMNS =
  "id, author_id, title, slug, in_response_to, excerpt, type, content_kind, " +
  "article_format, citation_id, published_version_id, created_at, published_at, " +
  "cover_image_url, tags, " +
  "post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))";

const TOPIC_COLUMNS =
  "id, author_id, in_response_to, tags, type, published_at, created_at";

export function createSupabaseProfileRecordRepository(
  supabase: SupabaseClient
): ProfileRecordRepository {
  return {
    async recordSummary(profileId, includeResearch) {
      const args = {
        p_profile_id: profileId,
        p_include_research: includeResearch,
      };

      const v2 = await supabase.rpc("get_public_profile_record_summary_v2", args);
      if (!v2.error) return v2.data;
      if (!isMissingFunction(v2.error)) throw new Error(v2.error.message);

      const v1 = await supabase.rpc("get_public_profile_record_summary", args);
      if (v1.error) throw new Error(v1.error.message);
      return v1.data;
    },

    async entries(query) {
      let builder = supabase
        .from("profile_record_entries")
        .select(ENTRY_COLUMNS, { count: "exact" })
        .eq("profile_id", query.profileId);

      if (!query.includeResearch) {
        builder = builder.neq("entry_kind", "research");
      }
      if (query.kinds) {
        builder =
          query.kinds.length === 1
            ? builder.eq("entry_kind", query.kinds[0])
            : builder.in("entry_kind", query.kinds);
      }
      if (query.sourceBacked !== null) {
        builder = builder.eq("source_backed", query.sourceBacked);
      }
      if (query.citable !== null) {
        builder = builder.eq("citable", query.citable);
      }
      if (query.entryIds) {
        builder = builder.in("entry_id", query.entryIds);
      }

      const result = await builder
        .order("occurred_at", { ascending: false })
        .order("entry_id", { ascending: false })
        .range(query.start, query.start + query.pageSize - 1);

      return {
        entries: rows<ProfileRecordEntryRow>(result, "record entries"),
        totalCount: result.count ?? 0,
      };
    },

    async hydratePublications(postIds) {
      if (postIds.length === 0) return [];
      const result = await supabase
        .from("posts")
        .select(HYDRATE_COLUMNS)
        .in("id", postIds);
      return rows<ProfileRecordPostRow>(result, "record publications");
    },

    async topicPosts(profileId, limit) {
      const [ownedResult, coauthoredResult] = await Promise.all([
        supabase
          .from("posts")
          .select(TOPIC_COLUMNS)
          .eq("author_id", profileId)
          .eq("status", "published")
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("post_authors")
          .select(`posts!post_authors_post_id_fkey(${TOPIC_COLUMNS}, status)`)
          .eq("user_id", profileId)
          .not("accepted_at", "is", null)
          .order("accepted_at", { ascending: false })
          .limit(limit),
      ]);

      const owned = rows<ProfileTopicPostRow>(ownedResult, "topic posts");
      const wrappers = rows<{
        posts: ProfileTopicPostRow | ProfileTopicPostRow[] | null;
      }>(coauthoredResult, "co-authored topic posts");

      const coauthored = wrappers.flatMap((wrapper) => {
        const post = Array.isArray(wrapper.posts) ? wrapper.posts[0] : wrapper.posts;
        return post ? [post] : [];
      });

      return { owned, coauthored };
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresProfileRecordRepository(
  executor: SqlExecutor
): ProfileRecordRepository {
  return {
    async recordSummary(profileId, includeResearch) {
      const params = [profileId, includeResearch];
      try {
        return await executor.query(
          "select * from public.get_public_profile_record_summary_v2($1::uuid, $2::boolean)",
          params
        );
      } catch (error) {
        if (!isUndefinedFunction(error)) throw error;
      }
      return executor.query(
        "select * from public.get_public_profile_record_summary($1::uuid, $2::boolean)",
        params
      );
    },

    async entries(query) {
      const result = await executor.query<
        ProfileRecordEntryRow & { total_count: string | number }
      >(ENTRIES_SQL, [
        query.profileId,
        query.includeResearch,
        query.kinds ? JSON.stringify(query.kinds) : null,
        query.sourceBacked,
        query.citable,
        query.entryIds ? JSON.stringify(query.entryIds) : null,
        query.pageSize,
        query.start,
      ]);

      return {
        entries: result.map(({ total_count: _ignored, ...entry }) => entry),
        // `count(*) over ()` is a bigint, which arrives as a string. No rows
        // means no window to read it from, and no matches is zero.
        totalCount: result.length === 0 ? 0 : Number(result[0].total_count),
      };
    },

    async hydratePublications(postIds) {
      if (postIds.length === 0) return [];
      return executor.query<ProfileRecordPostRow>(HYDRATE_SQL, [
        JSON.stringify(postIds),
      ]);
    },

    async topicPosts(profileId, limit) {
      const [owned, coauthored] = await Promise.all([
        executor.query<ProfileTopicPostRow>(OWNED_TOPIC_SQL, [profileId, limit]),
        executor.query<ProfileTopicPostRow>(COAUTHORED_TOPIC_SQL, [profileId, limit]),
      ]);
      return { owned, coauthored };
    },
  };
}
