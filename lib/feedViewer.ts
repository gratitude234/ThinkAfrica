import "server-only";

import { getFeedExcludedUserIds } from "@/lib/blocking";
import {
  feedViewerRepository,
  postgresFeedViewerRepository,
} from "@/lib/db/readAdapter";
import { FeedDataError } from "@/lib/feedData";

/**
 * Everything the feed needs to know about who is reading.
 *
 * The normal transport follows the `feed` read domain. That is important: once
 * the feed is cut over to direct PostgreSQL, Home no longer keeps one hidden
 * PostgREST dependency just to resolve interests/follows/blocks.
 *
 * Before that cutover, the Supabase RPC remains the primary path. A direct-SQL
 * failover can be enabled explicitly with FEED_VIEWER_POSTGRES_FAILOVER=1 after
 * DATABASE_URL has been verified to point at a production-safe database. The
 * failover is deliberately opt-in because this repository contains migration
 * environments where DATABASE_URL may point at a scratch or otherwise unsafe
 * target.
 */
export interface FeedViewerContext {
  userId: string | null;
  userInterests: string[];
  followedIds: string[];
  excludedAuthorIds: string[];
}

interface FeedViewerClient {
  from: (table: string) => any;
  rpc?: (
    fn: string,
    params?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error?: unknown }>;
}

let warnedMissingContextRpc = false;

function errorCode(error: unknown): string | undefined {
  const source = error as { code?: unknown; cause?: unknown } | null;
  if (typeof source?.code === "string" && source.code) return source.code;
  const cause = source?.cause as { code?: unknown } | null | undefined;
  return typeof cause?.code === "string" && cause.code ? cause.code : undefined;
}

function errorStatus(error: unknown): number | undefined {
  const source = error as { status?: unknown; cause?: unknown } | null;
  if (typeof source?.status === "number") return source.status;
  const cause = source?.cause as { status?: unknown } | null | undefined;
  return typeof cause?.status === "number" ? cause.status : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  const source = error as { message?: unknown } | null;
  return typeof source?.message === "string" ? source.message : "";
}

function isMissingContextRpc(error: unknown): boolean {
  return ["PGRST202", "42883"].includes(errorCode(error) ?? "");
}

/**
 * Only availability/transport failures are eligible for a transport failover.
 * Permission, validation and data-contract failures are intentionally not
 * hidden by asking a second backend: they need to be fixed, not routed around.
 */
export function isFeedViewerTransportFailure(error: unknown): boolean {
  const status = errorStatus(error);
  if (status !== undefined && [502, 503, 504].includes(status)) return true;

  const code = (errorCode(error) ?? "").toUpperCase();
  if (
    [
      "CONNECT_TIMEOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
      "CONNECTION_CLOSED",
      "CONNECTION_DESTROYED",
    ].includes(code)
  ) {
    return true;
  }

  const name = (error as { name?: unknown } | null)?.name;
  if (name === "SupabaseTimeoutError" || name === "AuthRetryableFetchError") {
    return true;
  }

  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("supabase did not respond within") ||
    message.includes("gateway timeout") ||
    message.includes("fetch failed") ||
    message.includes("network error")
  );
}

export function isFeedViewerPostgresFailoverEnabled(
  raw: string | undefined = process.env.FEED_VIEWER_POSTGRES_FAILOVER
): boolean {
  return raw === "1";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
    : [];
}

export function anonymousFeedViewer(): FeedViewerContext {
  return { userId: null, userInterests: [], followedIds: [], excludedAuthorIds: [] };
}

function contextFromRecord(
  userId: string,
  personalized: boolean,
  record: {
    userInterests: string[];
    followedIds: string[];
    excludedAuthorIds: string[];
  }
): FeedViewerContext {
  return {
    userId: personalized ? userId : null,
    userInterests: personalized ? stringArray(record.userInterests) : [],
    followedIds: personalized ? stringArray(record.followedIds) : [],
    excludedAuthorIds: stringArray(record.excludedAuthorIds),
  };
}

async function loadCompatibilityViewer(
  supabase: FeedViewerClient,
  userId: string,
  personalized: boolean
): Promise<FeedViewerContext> {
  // Migration-lag compatibility only. A depersonalized request keeps the
  // strict block list and reads nothing else.
  if (!personalized) {
    return {
      ...anonymousFeedViewer(),
      excludedAuthorIds: await getFeedExcludedUserIds(userId, { strict: true }),
    };
  }

  const [profile, follows, excludedAuthorIds] = await Promise.all([
    supabase.from("profiles").select("interests").eq("id", userId).maybeSingle(),
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    getFeedExcludedUserIds(userId, { strict: true }),
  ]);

  if (profile.error) throw new FeedDataError("load reader interests", profile.error);
  if (follows.error) throw new FeedDataError("load followed writers", follows.error);

  const interests: unknown = profile.data?.interests;
  return {
    userId,
    userInterests: Array.isArray(interests)
      ? interests.filter((value): value is string => typeof value === "string")
      : [],
    followedIds: ((follows.data ?? []) as Array<{ following_id: string | null }>)
      .map((row) => row.following_id)
      .filter((id): id is string => Boolean(id)),
    excludedAuthorIds,
  };
}

export async function loadFeedViewer(
  supabase: FeedViewerClient,
  userId: string | null,
  { personalized = true }: { personalized?: boolean } = {}
): Promise<FeedViewerContext> {
  if (!userId) return anonymousFeedViewer();

  const primary = feedViewerRepository(supabase as never);

  try {
    const record = await primary.load({ userId, personalized });
    return contextFromRecord(userId, personalized, record);
  } catch (error) {
    // A deployment where the migration has not reached Supabase yet keeps the
    // old bounded compatibility path. Do not treat a missing function as an
    // outage or send it to an unrelated database.
    if (primary.backend === "supabase" && isMissingContextRpc(error)) {
      if (!warnedMissingContextRpc) {
        warnedMissingContextRpc = true;
        console.warn(
          "[feed-viewer] get_feed_viewer_context is not installed yet; using compatibility reads",
          error
        );
      }
      return loadCompatibilityViewer(supabase, userId, personalized);
    }

    // The direct-SQL escape hatch is explicit. This avoids accidentally
    // serving production reader state from a scratch/stale migration database.
    if (
      primary.backend === "supabase" &&
      isFeedViewerTransportFailure(error) &&
      isFeedViewerPostgresFailoverEnabled()
    ) {
      try {
        const record = await postgresFeedViewerRepository().load({
          userId,
          personalized,
        });
        console.warn(
          "[feed-viewer] Supabase viewer context unavailable; served via PostgreSQL failover"
        );
        return contextFromRecord(userId, personalized, record);
      } catch (fallbackError) {
        console.error(
          "[feed-viewer] PostgreSQL viewer-context failover also failed",
          fallbackError
        );
        throw new FeedDataError("load feed viewer context", fallbackError);
      }
    }

    throw new FeedDataError("load feed viewer context", error);
  }
}
