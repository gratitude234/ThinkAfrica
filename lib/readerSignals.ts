import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ReaderAffinity,
  ViewerPostEngagement,
} from "@/lib/feedRanking";

/**
 * Reads the engagement diary the site has been keeping and turns it into the
 * two things the ranker can use: what this person keeps coming back to, and
 * what they have already been shown.
 *
 * Everything here fails soft. These are optional ranking signals layered on
 * top of a feed that worked without them, and the migration that installs the
 * functions is applied by hand through the Supabase dashboard. A feed that
 * failed because a signal is missing would be a far worse outcome than a feed
 * that ranks the way it did last week, so a failure is logged once and then
 * treated as "no history", which is exactly what a brand new reader looks like.
 */

interface RpcCapableClient {
  rpc?: (fn: string, params?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error?: unknown;
  }>;
}

/**
 * A client with no `rpc` is not a failure, it is a caller that never had these
 * signals available -- a narrow test double, or a surface wired with a
 * from-only client. Silently returning no history is the correct answer, and
 * warning about it would train people to ignore the warning.
 */
function canCallRpc(
  client: RpcCapableClient
): client is Required<RpcCapableClient> {
  return typeof client.rpc === "function";
}

/** Qualified reads older than this stop describing who someone is now. */
const AFFINITY_WINDOW_DAYS = 90;
/** How far back "you have already seen this" reaches. */
const SEEN_WINDOW_DAYS = 30;
const AFFINITY_ROW_LIMIT = 24;
const AFFINITY_CACHE_SECONDS = 600;

/**
 * A viewer with nothing in the diary yet. Shared so the several ways of
 * arriving at "no signal" cannot drift apart.
 */
export const EMPTY_READER_AFFINITY: ReaderAffinity = {
  authors: new Map(),
  topics: new Map(),
};

type AffinityKind = "author" | "topic";
type SerializableAffinity = {
  authors: Array<[string, number]>;
  topics: Array<[string, number]>;
};

const reportedFailures = new Set<string>();

/**
 * One line per distinct failure for the lifetime of the process. A signal that
 * is unavailable is unavailable on every feed request, and repeating that a few
 * hundred times a minute buries everything else in the log.
 */
function reportOnce(operation: string, error: unknown) {
  if (reportedFailures.has(operation)) return;
  reportedFailures.add(operation);
  console.warn(
    `[reader-signals] ${operation} unavailable, ranking without it`,
    error
  );
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeTopicKey(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

/**
 * Rescales raw read counts to 0..1 against the reader's own strongest
 * preference rather than against a global constant. Someone who reads four
 * things a month and someone who reads four hundred should both be able to
 * express "this one, most of all".
 */
function toRelativeWeights(
  counts: Array<{ key: string; weight: number }>
): Map<string, number> {
  const weights = new Map<string, number>();
  const strongest = counts.reduce(
    (highest, entry) => Math.max(highest, entry.weight),
    0
  );
  if (strongest <= 0) return weights;

  for (const entry of counts) {
    if (!entry.key) continue;
    weights.set(entry.key, Math.min(1, entry.weight / strongest));
  }
  return weights;
}

async function getReaderAffinityUncached(
  client: RpcCapableClient,
  userId: string
): Promise<SerializableAffinity> {
  const empty: SerializableAffinity = { authors: [], topics: [] };
  if (!canCallRpc(client)) return empty;

  try {
    const { data, error } = await client.rpc("get_reader_affinity", {
      p_user_id: userId,
      p_since: isoDaysAgo(AFFINITY_WINDOW_DAYS),
      p_limit: AFFINITY_ROW_LIMIT,
    });
    if (error) {
      reportOnce("get_reader_affinity", error);
      return empty;
    }

    const rows = Array.isArray(data)
      ? (data as Array<{ kind?: unknown; key?: unknown; weight?: unknown }>)
      : [];
    const byKind: Record<AffinityKind, Array<{ key: string; weight: number }>> =
      { author: [], topic: [] };

    for (const row of rows) {
      const kind = row.kind === "author" || row.kind === "topic" ? row.kind : null;
      const key = typeof row.key === "string" ? row.key.trim() : "";
      const weight = Number(row.weight);
      if (!kind || !key || !Number.isFinite(weight) || weight <= 0) continue;
      byKind[kind].push({
        key: kind === "topic" ? normalizeTopicKey(key) : key,
        weight,
      });
    }

    return {
      authors: Array.from(toRelativeWeights(byKind.author).entries()),
      topics: Array.from(toRelativeWeights(byKind.topic).entries()),
    };
  } catch (error) {
    reportOnce("get_reader_affinity", error);
    return empty;
  }
}

// Cached per user. A reading history moves over weeks, so a ten-minute view of
// it is indistinguishable from a live one, and this runs on every feed request
// for every signed-in reader.
const fetchCachedReaderAffinity = unstable_cache(
  async (userId: string) =>
    getReaderAffinityUncached(createAdminClient(), userId),
  ["reader-affinity"],
  { revalidate: AFFINITY_CACHE_SECONDS, tags: ["feed", "reader-affinity"] }
);

export async function getReaderAffinity(
  client: RpcCapableClient,
  userId: string | null
): Promise<ReaderAffinity> {
  if (!userId) return EMPTY_READER_AFFINITY;

  const serialized = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await fetchCachedReaderAffinity(userId)
    : await getReaderAffinityUncached(client, userId);

  return {
    authors: new Map(serialized.authors),
    topics: new Map(serialized.topics),
  };
}

/**
 * Deliberately not cached, and deliberately scoped to the candidate ids the
 * feed is about to rank. Scoping keeps the result bounded by the size of the
 * candidate window instead of by how long someone has been a member, and
 * skipping the cache is what lets "I have seen this three times today" be true
 * on the third scroll rather than ten minutes after it.
 */
export async function getViewerPostEngagement(
  client: RpcCapableClient,
  userId: string | null,
  postIds: string[]
): Promise<Map<string, ViewerPostEngagement>> {
  const engagement = new Map<string, ViewerPostEngagement>();
  const ids = Array.from(new Set(postIds.filter(Boolean)));
  if (!userId || ids.length === 0 || !canCallRpc(client)) return engagement;

  try {
    const { data, error } = await client.rpc("get_viewer_post_engagement", {
      p_user_id: userId,
      p_post_ids: ids,
      p_since: isoDaysAgo(SEEN_WINDOW_DAYS),
    });
    if (error) {
      reportOnce("get_viewer_post_engagement", error);
      return engagement;
    }

    const rows = Array.isArray(data)
      ? (data as Array<{
          post_id?: unknown;
          impressions?: unknown;
          has_read?: unknown;
        }>)
      : [];

    for (const row of rows) {
      const postId = typeof row.post_id === "string" ? row.post_id : "";
      if (!postId) continue;
      const impressions = Number(row.impressions);
      engagement.set(postId, {
        impressions:
          Number.isFinite(impressions) && impressions > 0 ? impressions : 0,
        hasRead: row.has_read === true,
      });
    }

    return engagement;
  } catch (error) {
    reportOnce("get_viewer_post_engagement", error);
    return engagement;
  }
}

/** Test seam: the once-per-process log guard would otherwise leak across specs. */
export function resetReaderSignalWarnings() {
  reportedFailures.clear();
}
