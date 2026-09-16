import "server-only";

import { getFeedExcludedUserIds } from "@/lib/blocking";
import { FeedDataError } from "@/lib/feedData";

/**
 * Everything the feed needs to know about who is reading.
 *
 * Three reads, and only three: the topics the member chose, the writers they
 * follow, and who is on either side of a block. Before the publishing reset
 * (Phase 2F) Home issued nine parallel queries before its feed even started,
 * for a sidebar, a featured lead, banners, subscription tabs, activation and
 * retention. The Home feed and `/api/feed` both load their reader through
 * this, and lib/feedViewer.test.ts pins what it reads.
 */
export interface FeedViewerContext {
  userId: string | null;
  userInterests: string[];
  followedIds: string[];
  excludedAuthorIds: string[];
}

interface FeedViewerClient {
  from: (table: string) => any;
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

  // A depersonalized request, Explore's Trending shelf, keeps the block list
  // and reads nothing else, so its later pages rank exactly like the
  // anonymous first page. Blocking is never waived.
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
