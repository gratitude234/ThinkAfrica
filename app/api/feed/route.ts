import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFeedPage,
  FeedCursorError,
  MAX_FEED_PAGE,
  MAX_FEED_PAGE_SIZE,
  normalizeFeedContentFilter,
  RANKED_FEED_WINDOW,
  type FeedTabKey,
  type FeedTimeframe,
} from "@/lib/feedData";
import { prepareFeedPageForClient } from "@/lib/feedExposure";
import { getFeedExcludedUserIds } from "@/lib/blocking";
import {
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
} from "@/lib/featureFlags";
import type { SubscriptionFeedSource } from "@/lib/publicationDelivery";

const FEED_SESSION_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function getPositiveInteger(
  param: string | null,
  fallback: number,
  maximum: number
) {
  const value = Number(param ?? fallback);
  if (!Number.isFinite(value) || value < 1 || value > maximum) return null;
  return Math.floor(value);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = getPositiveInteger(params.get("page"), 1, MAX_FEED_PAGE);
    const pageSize = getPositiveInteger(
      params.get("pageSize"),
      12,
      MAX_FEED_PAGE_SIZE
    );
    if (page === null || pageSize === null) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PAGINATION",
            message: `page must be 1-${MAX_FEED_PAGE} and pageSize must be 1-${MAX_FEED_PAGE_SIZE}.`,
          },
        },
        { status: 400 }
      );
    }
    const supabase = await createClient();
    const tab = getTab(params.get("tab"));
    const timeframe = getTimeframe(params.get("timeframe"));
    const type = getType(params.get("type"));
    const subscriptionSource = getSource(params.get("source"));
    const cursor = params.get("cursor");
    const requestedFeedSessionId = params.get("session");
    const feedSessionId =
      requestedFeedSessionId && FEED_SESSION_PATTERN.test(requestedFeedSessionId)
        ? requestedFeedSessionId
        : undefined;

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
        : Promise.resolve({
            data: [] as Array<{ topic_key: string }>,
            error: null,
          });
      const authorSubscriptionsPromise = isAuthorSubscriptionsUxV2Enabled()
        ? supabase
            .from("author_subscriptions")
            .select("author_id")
            .eq("subscriber_id", user.id)
        : Promise.resolve({
            data: [] as Array<{ author_id: string }>,
            error: null,
          });
      const [
        { data: profile, error: profileError },
        { data: followedUsers, error: followsError },
        blockedIds,
        { data: topicSubscriptions, error: topicSubscriptionsError },
        { data: authorSubscriptions, error: authorSubscriptionsError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("interests, university")
          .eq("id", user.id)
          .single(),
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id),
        getFeedExcludedUserIds(user.id, { strict: true }),
        topicSubscriptionsPromise,
        authorSubscriptionsPromise,
      ]);

      const contextError =
        profileError ??
        followsError ??
        topicSubscriptionsError ??
        authorSubscriptionsError;
      if (contextError) {
        throw new Error("Unable to load feed personalization context.");
      }

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
      cursor,
    });

    return NextResponse.json(
      prepareFeedPageForClient(result, {
        tab,
        page,
        pageSize,
        rankedWindow: RANKED_FEED_WINDOW,
        feedSessionId,
      })
    );
  } catch (error) {
    if (error instanceof FeedCursorError) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CURSOR",
            message: "The feed cursor is invalid or no longer matches this view.",
          },
        },
        { status: 400 }
      );
    }
    console.error("[feed-api] failed to load feed", error);
    return NextResponse.json(
      {
        error: {
          code: "FEED_UNAVAILABLE",
          message: "The feed could not be loaded. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
