import PostsFeedTabs from "./PostsFeedTabs";
import {
  fetchFeedPage,
  normalizeFeedContentFilter,
  type FeedContentFilter,
  type FeedTimeframe,
  type FeedTabKey,
} from "@/lib/feedData";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/blocking";
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
  const excludedAuthorIds = await getBlockedUserIds(userId);

  const initialFeed = await fetchFeedPage({
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

  return (
    <PostsFeedTabs
      initialTab={initialTab}
      initialType={initialType}
      initialTimeframe={initialTimeframe}
      initialPosts={initialFeed.posts}
      initialHasMore={initialFeed.hasMore}
      showFollowingTab={showFollowingEligible}
      showTopicsTab={showTopicsEligible}
      showSubscriptionsTab={showSubscriptionsEligible}
      initialSubscriptionSource={subscriptionSource}
      activeDebate={activeDebate}
      peopleSuggestions={peopleSuggestions}
      peopleSuggestionReason={peopleSuggestionReason}
      prioritizePeopleSuggestions={prioritizePeopleSuggestions}
      currentUserId={userId}
      featuredPost={featuredPost}
    />
  );
}
