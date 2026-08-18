import PostsFeedTabs from "./PostsFeedTabs";
import {
  fetchFeedPage,
  normalizeFeedContentFilter,
  RANKED_FEED_WINDOW,
  type FeedContentFilter,
  type FeedPageResult,
  type FeedTimeframe,
  type FeedTabKey,
} from "@/lib/feedData";
import {
  createFeaturedExposure,
  prepareFeedPageForClient,
} from "@/lib/feedExposure";
import { createClient } from "@/lib/supabase/server";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { HomeFeaturedPost } from "@/components/post/HomeFeaturedLead";
import type { SubscriptionFeedSource } from "@/lib/publicationDelivery";

interface Props {
  tab: string;
  type: string | null;
  timeframe: string | null;
  userId: string | null;
  userInterests: string[];
  userUniversity: string | null;
  followedIds: string[];
  authorSubscriptionIds: string[];
  topicSubscriptionKeys: string[];
  excludedAuthorIds: string[];
  subscriptionSource: SubscriptionFeedSource;
  showFollowingEligible: boolean;
  showTopicsEligible: boolean;
  showSubscriptionsEligible: boolean;
  activeDebate: DebateInterludeData | null;
  peopleSuggestions: {
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  }[];
  peopleSuggestionReason?: string;
  prioritizePeopleSuggestions?: boolean;
  featuredPost?: HomeFeaturedPost | null;
}

function getInitialTab(
  tab: string,
  showFollowingEligible: boolean,
  showTopicsEligible: boolean,
  showSubscriptionsEligible: boolean
): FeedTabKey {
  if (tab === "following" && showFollowingEligible) return "following";
  if (tab === "subscriptions" && showSubscriptionsEligible) {
    return "subscriptions";
  }
  if (tab === "topics" && showTopicsEligible) return "topics";
  if (tab === "latest") return "latest";
  return "home";
}

function getInitialType(type: string | null): FeedContentFilter {
  return normalizeFeedContentFilter(type);
}

function getInitialTimeframe(timeframe: string | null): FeedTimeframe {
  if (timeframe === "week" || timeframe === "month") return timeframe;
  return "all";
}

export default async function PostsFeedSection({
  tab,
  type,
  timeframe,
  userId,
  userInterests,
  userUniversity,
  followedIds,
  authorSubscriptionIds,
  topicSubscriptionKeys,
  excludedAuthorIds,
  subscriptionSource,
  showFollowingEligible,
  showTopicsEligible,
  showSubscriptionsEligible,
  activeDebate,
  peopleSuggestions,
  peopleSuggestionReason,
  prioritizePeopleSuggestions = false,
  featuredPost = null,
}: Props) {
  const supabase = await createClient();
  const initialTab = getInitialTab(
    tab,
    showFollowingEligible,
    showTopicsEligible,
    showSubscriptionsEligible
  );
  const initialType = getInitialType(type);
  const initialTimeframe = getInitialTimeframe(timeframe);
  let initialFeed: FeedPageResult = { posts: [], hasMore: false };
  let initialLoadFailed = false;

  try {
    initialFeed = await fetchFeedPage({
      supabase,
      tab: initialTab,
      page: 1,
      pageSize: 12,
      type: initialType === "all" ? null : initialType,
      timeframe: initialTimeframe,
      userId,
      userInterests,
      userUniversity,
      followedIds,
      authorSubscriptionIds,
      topicSubscriptionKeys,
      subscriptionSource,
      excludedAuthorIds,
    });
  } catch (error) {
    initialLoadFailed = true;
    console.error("[home-feed] initial feed query failed", error);
  }

  const requestId = crypto.randomUUID();
  const clientFeed = prepareFeedPageForClient(initialFeed, {
    tab: initialTab,
    page: 1,
    pageSize: 12,
    rankedWindow: RANKED_FEED_WINDOW,
    requestId,
  });
  const clientFeaturedPost = featuredPost
    ? {
        ...featuredPost,
        feed_exposure: createFeaturedExposure(
          featuredPost.id,
          featuredPost.slug,
          featuredPost.featured_provenance ?? "recommended",
          requestId
        ),
      }
    : null;

  return (
    <PostsFeedTabs
      initialTab={initialTab}
      initialType={initialType}
      initialTimeframe={initialTimeframe}
      initialPosts={clientFeed.posts}
      initialHasMore={clientFeed.hasMore}
      initialNextCursor={clientFeed.nextCursor ?? null}
      initialLoadFailed={initialLoadFailed}
      showFollowingTab={showFollowingEligible}
      showTopicsTab={showTopicsEligible}
      showSubscriptionsTab={showSubscriptionsEligible}
      initialSubscriptionSource={subscriptionSource}
      activeDebate={activeDebate}
      peopleSuggestions={peopleSuggestions}
      peopleSuggestionReason={peopleSuggestionReason}
      prioritizePeopleSuggestions={prioritizePeopleSuggestions}
      currentUserId={userId}
      featuredPost={clientFeaturedPost}
    />
  );
}
