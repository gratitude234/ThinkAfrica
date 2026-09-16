import PostsFeedTabs from "./PostsFeedTabs";
import {
  fetchFeedPage,
  RANKED_FEED_WINDOW,
  type FeedPageResult,
  type FeedTabKey,
} from "@/lib/feedData";
import { prepareFeedPageForClient } from "@/lib/feedExposure";
import { loadFeedViewer } from "@/lib/feedViewer";
import { createClient } from "@/lib/supabase/server";

const HOME_PAGE_SIZE = 12;

/**
 * The first page of Home's feed, rendered on the server.
 *
 * Everything Home reads happens here, inside the page's Suspense boundary: the
 * three viewer reads in lib/feedViewer.ts, then one page of the feed. A failure
 * in either becomes the feed's retryable error state rather than a broken page.
 */
export default async function PostsFeedSection({
  tab,
  userId,
}: {
  tab: FeedTabKey;
  userId: string | null;
}) {
  const supabase = await createClient();
  let initialFeed: FeedPageResult = { posts: [], hasMore: false };
  let initialLoadFailed = false;

  try {
    const viewer = await loadFeedViewer(supabase, userId);
    initialFeed = await fetchFeedPage({
      supabase,
      tab,
      page: 1,
      pageSize: HOME_PAGE_SIZE,
      type: null,
      timeframe: "all",
      ...viewer,
    });
  } catch (error) {
    initialLoadFailed = true;
    console.error("[home-feed] initial feed query failed", error);
  }

  const clientFeed = prepareFeedPageForClient(initialFeed, {
    tab,
    page: 1,
    pageSize: HOME_PAGE_SIZE,
    rankedWindow: RANKED_FEED_WINDOW,
    requestId: crypto.randomUUID(),
  });

  return (
    <PostsFeedTabs
      initialTab={tab}
      initialPosts={clientFeed.posts}
      initialHasMore={clientFeed.hasMore}
      initialNextCursor={clientFeed.nextCursor ?? null}
      initialLoadFailed={initialLoadFailed}
      currentUserId={userId}
    />
  );
}
