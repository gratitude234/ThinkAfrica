import "server-only";

import { getFeedExcludedUserIds } from "@/lib/blocking";
import { FeedDataError } from "@/lib/feedData";

/**
 * Everything the feed needs to know about who is reading.
 *
 * The preferred path is one bounded RPC that returns interests, follows and
 * both directions of the block graph. The compatibility path remains for the
 * deployment window before the matching migration reaches production.
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

function isMissingContextRpc(error: unknown): boolean {
  return ["PGRST202", "42883"].includes(errorCode(error) ?? "");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
    : [];
}

export function anonymousFeedViewer(): FeedViewerContext {
  return { userId: null, userInterests: [], followedIds: [], excludedAuthorIds: [] };
}

export async function loadFeedViewer(
  supabase: FeedViewerClient,
  userId: string | null,
  { personalized = true }: { personalized?: boolean } = {}
): Promise<FeedViewerContext> {
  if (!userId) return anonymousFeedViewer();

  // One request replaces the old profile + follows + service-role block fan-out.
  // The function itself is strict about identity and sees both directions of a
  // block, so using it does not weaken trust-and-safety.
  if (typeof supabase.rpc === "function") {
    const result = await supabase.rpc("get_feed_viewer_context", {
      p_user_id: userId,
      p_personalized: personalized,
    });

    if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
      const row = result.data[0] as Record<string, unknown>;
      return {
        userId: personalized ? userId : null,
        userInterests: personalized ? stringArray(row.user_interests) : [],
        followedIds: personalized ? stringArray(row.followed_ids) : [],
        excludedAuthorIds: stringArray(row.excluded_author_ids),
      };
    }

    if (result.error && isMissingContextRpc(result.error)) {
      if (!warnedMissingContextRpc) {
        warnedMissingContextRpc = true;
        console.warn(
          "[feed-viewer] get_feed_viewer_context is not installed yet; using compatibility reads",
          result.error
        );
      }
    } else if (result.error) {
      throw new FeedDataError("load feed viewer context", result.error);
    }
  }

  // Compatibility path for migration lag. A depersonalized request keeps the
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
