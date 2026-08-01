import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFeedPage,
  normalizeFeedContentFilter,
  type FeedTabKey,
  type FeedTimeframe,
} from "@/lib/feedData";
import { getBlockedUserIds } from "@/lib/blocking";
import {
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
} from "@/lib/featureFlags";
import type { SubscriptionFeedSource } from "@/lib/publicationDelivery";

function getTab(param: string | null): FeedTabKey {
  if (param === "topics" && isTopicSubscriptionsEnabled()) return "topics";
  if (param === "subscriptions" && isAuthorSubscriptionsUxV2Enabled()) {
    return "subscriptions";
  }
  if (param === "following" || param === "latest") return param;
  return "home";
}

function getSource(param: string | null): SubscriptionFeedSource {
  if (param === "authors" || param === "topics") return param;
  return "all";
}

function getTimeframe(param: string | null): FeedTimeframe {
  if (param === "week" || param === "month") return param;
  return "all";
}

function getType(param: string | null) {
  const normalized = normalizeFeedContentFilter(param);
  return normalized === "all" ? null : normalized;
}

function getPositiveInteger(param: string | null, fallback: number) {
  const value = Number(param ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  const page = getPositiveInteger(params.get("page"), 1);
  const pageSize = getPositiveInteger(params.get("pageSize"), 12);
  const tab = getTab(params.get("tab"));
  const timeframe = getTimeframe(params.get("timeframe"));
  const type = getType(params.get("type"));
  const subscriptionSource = getSource(params.get("source"));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userInterests: string[] = [];
  let userUniversity: string | null = null;
  let followedIds: string[] = [];
  let authorSubscriptionIds: string[] = [];
  let topicSubscriptionKeys: string[] = [];
  let excludedAuthorIds: string[] = [];

  if (user) {
    const topicSubscriptionsPromise = isTopicSubscriptionsEnabled()
      ? supabase
          .from("topic_subscriptions")
          .select("topic_key")
          .eq("subscriber_id", user.id)
      : Promise.resolve({ data: [] as Array<{ topic_key: string }> });
    const authorSubscriptionsPromise = isAuthorSubscriptionsUxV2Enabled()
      ? supabase
          .from("author_subscriptions")
          .select("author_id")
          .eq("subscriber_id", user.id)
      : Promise.resolve({ data: [] as Array<{ author_id: string }> });
    const [
      { data: profile },
      { data: followedUsers },
      blockedIds,
      { data: topicSubscriptions },
      { data: authorSubscriptions },
    ] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("interests, university")
          .eq("id", user.id)
          .single(),
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id),
        getBlockedUserIds(user.id),
        topicSubscriptionsPromise,
        authorSubscriptionsPromise,
      ]);

    userInterests = (profile?.interests as string[] | null) ?? [];
    userUniversity = profile?.university ?? null;
    followedIds = (followedUsers ?? []).map(
      (row: { following_id: string }) => row.following_id
    );
    topicSubscriptionKeys = (topicSubscriptions ?? []).map(
      (row: { topic_key: string }) => row.topic_key
    );
    authorSubscriptionIds = (authorSubscriptions ?? []).map(
      (row: { author_id: string }) => row.author_id
    );
    excludedAuthorIds = blockedIds;
  }

  const result = await fetchFeedPage({
    supabase,
    tab,
    page,
    pageSize,
    type,
    timeframe,
    userId: user?.id ?? null,
    userInterests,
    userUniversity,
    followedIds,
    authorSubscriptionIds,
    topicSubscriptionKeys,
    subscriptionSource,
    excludedAuthorIds,
  });

  return NextResponse.json(result);
}
