import PostsFeedTabs from "./PostsFeedTabs";
import {
  fetchFeedPage,
  type FeedTimeframe,
  type FeedTabKey,
} from "@/lib/feedData";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/blocking";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";

interface Props {
  tab: string;
  type: string | null;
  timeframe: string | null;
  userId: string | null;
  userInterests: string[];
  userUniversity: string | null;
  followedIds: string[];
  showFollowingEligible: boolean;
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
}

function getInitialTab(tab: string, showFollowingEligible: boolean): FeedTabKey {
  if (tab === "following" && showFollowingEligible) return "following";
  if (tab === "latest") return "latest";
  return "home";
}

function getInitialType(type: string | null) {
  if (
    type === "research" ||
    type === "essay" ||
    type === "policy_brief" ||
    type === "blog"
  ) {
    return type;
  }
  return "all";
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
  showFollowingEligible,
  activeDebate,
  peopleSuggestions,
  peopleSuggestionReason,
  prioritizePeopleSuggestions = false,
}: Props) {
  const supabase = await createClient();
  const initialTab = getInitialTab(tab, showFollowingEligible);
  const initialType = getInitialType(type);
  const initialTimeframe = getInitialTimeframe(timeframe);
  const excludedAuthorIds = await getBlockedUserIds(userId);

  const initialFeed = await fetchFeedPage({
    supabase,
    tab: initialTab,
    page: 1,
    pageSize: 20,
    type: initialType === "all" ? null : initialType,
    timeframe: initialTimeframe,
    userId,
    userInterests,
    userUniversity,
    followedIds,
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
      activeDebate={activeDebate}
      peopleSuggestions={peopleSuggestions}
      peopleSuggestionReason={peopleSuggestionReason}
      prioritizePeopleSuggestions={prioritizePeopleSuggestions}
      currentUserId={userId}
    />
  );
}
