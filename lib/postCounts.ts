/**
 * How many bookmarks, references and comments a post has.
 *
 * These used to be answered by selecting every matching row and tallying them
 * in JavaScript, which is a counting method whose cost grows with success: a
 * post with five thousand bookmarks shipped five thousand rows across the wire
 * so the server could print the number five thousand. Worse, a PostgREST
 * `db-max-rows` ceiling truncates an over-limit select silently, so the feed
 * would have started ranking on quietly wrong numbers with nothing in the log.
 *
 * The counts now come from aggregates maintained next to the data (see
 * supabase/migrations/20260820000001_post_aggregate_counts.sql). The row-count
 * path is kept as a fallback, because these migrations are applied by hand
 * through the Supabase dashboard and a feed that breaks between deploying the
 * code and running the migration is not an acceptable intermediate state.
 *
 * The fallback is deliberately narrow: it is used only when the aggregate is
 * genuinely absent (deployment/migration lag). Gateway failures, timeouts and
 * permission errors are propagated instead of immediately launching a second,
 * heavier query at the same unhealthy service. Feed hydration can then choose
 * to degrade those optional counters without hiding a database incident.
 */

interface SupabaseQueryResult<T> {
  data: T | null;
  error?: unknown;
}

export interface CountableClient {
  from: (table: string) => any;
  rpc?: (
    fn: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error?: unknown }>;
}

export type CountableTable =
  | "likes"
  | "bookmarks"
  | "comments"
  | "post_references";

const reportedFallbacks = new Set<string>();

function reportFallbackOnce(source: string, error: unknown) {
  if (reportedFallbacks.has(source)) return;
  reportedFallbacks.add(source);
  console.warn(
    `[post-counts] ${source} unavailable, counting rows instead`,
    error
  );
}

/** Test seam: the once-per-process log guard would otherwise leak across specs. */
export function resetPostCountWarnings() {
  reportedFallbacks.clear();
}

function countFailure(errorLike: unknown, operation: string) {
  const source = errorLike as { message?: unknown; code?: unknown } | null;
  const detail =
    typeof source?.message === "string" && source.message.trim()
      ? source.message
      : errorLike instanceof Error && errorLike.message.trim()
        ? errorLike.message
        : "Unknown database error";
  const error = new Error(`Count query failed (${operation}): ${detail}`) as Error & {
    operation: string;
    code?: string;
    cause: unknown;
  };
  error.name = "PostCountError";
  error.operation = operation;
  error.code =
    typeof source?.code === "string" && source.code ? source.code : undefined;
  error.cause = errorLike;
  return error;
}

function expectRows<T>(result: SupabaseQueryResult<T[]>, operation: string): T[] {
  if (result.error) throw countFailure(result.error, operation);
  return result.data ?? [];
}

function errorCode(error: unknown): string | undefined {
  const source = error as { code?: unknown; cause?: unknown } | null;
  if (typeof source?.code === "string" && source.code) return source.code;
  const cause = source?.cause as { code?: unknown } | null | undefined;
  return typeof cause?.code === "string" && cause.code ? cause.code : undefined;
}

/**
 * Only a genuinely absent aggregate is allowed to fall back to row counting.
 *
 * A timeout, permission failure, gateway outage or stale schema cache is NOT a
 * migration-lag signal. Falling back after one of those errors immediately
 * fires a second (and usually more expensive) query at the same sick service,
 * which is exactly the retry storm the global Supabase timeout is designed to
 * avoid.
 */
function isMissingAggregateTable(error: unknown): boolean {
  return ["PGRST205", "42P01"].includes(errorCode(error) ?? "");
}

function isMissingCommentAggregate(error: unknown): boolean {
  return ["PGRST202", "42883"].includes(errorCode(error) ?? "");
}

/**
 * The original row-tally. Still correct, still the fallback, and still the
 * right tool for a one-off lookup over a handful of ids.
 */
export async function getCountsByPostId(
  supabase: CountableClient,
  table: CountableTable,
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const result = (await supabase
    .from(table)
    .select("post_id")
    .in("post_id", postIds)) as SupabaseQueryResult<Array<{ post_id?: string }>>;
  const data = expectRows(result, `count ${table}`);

  return data.reduce(
    (acc: Record<string, number>, row: { post_id?: string }) => {
      const key = row.post_id;
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * Reads one of the maintained counter tables. Returns null (rather than an
 * empty object) only when the aggregate is genuinely absent, so the caller can
 * use the migration-lag fallback. Operational failures are thrown.
 */
async function readAggregateCounts(
  supabase: CountableClient,
  table: string,
  column: string,
  postIds: string[]
): Promise<Record<string, number> | null> {
  try {
    const result = (await supabase
      .from(table)
      .select(`post_id, ${column}`)
      .in("post_id", postIds)) as SupabaseQueryResult<
      Array<Record<string, unknown>>
    >;

    if (result.error) {
      if (isMissingAggregateTable(result.error)) {
        reportFallbackOnce(table, result.error);
        return null;
      }
      throw countFailure(result.error, `read ${table}`);
    }
    // A working aggregate answers with an array, empty at worst. Anything else
    // means the table is not there yet, which is the migration-lag case.
    if (!Array.isArray(result.data)) return null;

    const counts: Record<string, number> = {};
    for (const row of result.data) {
      const postId = row.post_id;
      const value = Number(row[column]);
      if (typeof postId !== "string" || !postId) continue;
      counts[postId] = Number.isFinite(value) && value > 0 ? value : 0;
    }
    // Every post has a counter row once the backfill has run, so an empty
    // answer for a non-empty id list is the same signal as a missing table.
    if (postIds.length > 0 && Object.keys(counts).length === 0) return null;
    return counts;
  } catch (error) {
    if (isMissingAggregateTable(error)) {
      reportFallbackOnce(table, error);
      return null;
    }
    throw error;
  }
}

export async function getBookmarkCountsByPostId(
  supabase: CountableClient,
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const aggregate = await readAggregateCounts(
    supabase,
    "post_bookmark_counts",
    "bookmark_count",
    postIds
  );
  return aggregate ?? getCountsByPostId(supabase, "bookmarks", postIds);
}

export async function getReferenceCountsByPostId(
  supabase: CountableClient,
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const aggregate = await readAggregateCounts(
    supabase,
    "post_reference_counts",
    "reference_count",
    postIds
  );
  return aggregate ?? getCountsByPostId(supabase, "post_references", postIds);
}

// post_like_counts has been the maintained aggregate since 20260715000004 and
// posts.like_count was dropped in the same migration, so there is no row-count
// fallback to offer here: the rows this would tally no longer carry the number.
export async function getLikeCountsByPostId(
  supabase: CountableClient,
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const result = (await supabase
    .from("post_like_counts")
    .select("post_id, like_count")
    .in("post_id", postIds)) as SupabaseQueryResult<
    Array<{ post_id: string; like_count: number }>
  >;
  const data = expectRows(result, "load like aggregates");

  return data.reduce(
    (acc, row) => {
      acc[row.post_id] = row.like_count;
      return acc;
    },
    {} as Record<string, number>
  );
}

/**
 * Comments are counted per viewer, not globally, and that is deliberate: the
 * RLS SELECT policy on comments is what hides moderated rows, and an author
 * legitimately still sees their own hidden comment in the total. A shared
 * counter table would have to pick one of those two truths and be wrong about
 * the other.
 *
 * The aggregate function is SECURITY INVOKER, so it runs as the caller and the
 * same policy still decides what is visible. All that moves is where the
 * counting happens.
 */
export async function getVisibleCommentCountsByPostId(
  supabase: CountableClient,
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  if (typeof supabase.rpc === "function") {
    try {
      const { data, error } = await supabase.rpc(
        "count_visible_comments_by_post",
        { p_post_ids: postIds }
      );
      if (error) {
        if (isMissingCommentAggregate(error)) {
          reportFallbackOnce("count_visible_comments_by_post", error);
        } else {
          throw countFailure(error, "count visible comments");
        }
      } else if (Array.isArray(data)) {
        const counts: Record<string, number> = {};
        for (const row of data as Array<Record<string, unknown>>) {
          const postId = row.post_id;
          const value = Number(row.comment_count);
          if (typeof postId !== "string" || !postId) continue;
          counts[postId] = Number.isFinite(value) && value > 0 ? value : 0;
        }
        return counts;
      }
    } catch (error) {
      if (isMissingCommentAggregate(error)) {
        reportFallbackOnce("count_visible_comments_by_post", error);
      } else {
        throw error;
      }
    }
  }

  return getCountsByPostId(supabase, "comments", postIds);
}
