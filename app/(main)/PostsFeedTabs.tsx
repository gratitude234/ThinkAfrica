"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PostFeed from "@/components/post/PostFeed";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { PostCardData } from "@/components/post/PostCard";
import type { FeedTimeframe } from "@/lib/feedData";
import FeedFilterChips from "./FeedFilterChips";

type TabKey = "home" | "following" | "latest";
type TypeFilter = "all" | "research" | "essay" | "policy_brief" | "blog";

const EMPTY_POSTS: PostCardData[] = [];

interface FeedResponse {
  posts: PostCardData[];
  hasMore: boolean;
}

interface FeedCacheEntry extends FeedResponse {
  page: number;
  emptyPageCount: number;
}

function feedCacheKey(
  tab: TabKey,
  type: TypeFilter,
  timeframe: FeedTimeframe
) {
  return `${tab}:${type}:${timeframe}`;
}

function buildFeedUrl(tab: TabKey, type: TypeFilter, timeframe: FeedTimeframe) {
  const params = new URLSearchParams(window.location.search);
  params.set("tab", tab);
  if (type === "all") {
    params.delete("type");
  } else {
    params.set("type", type);
  }
  if (timeframe === "all") {
    params.delete("timeframe");
  } else {
    params.set("timeframe", timeframe);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function fetchFeed(
  tab: TabKey,
  type: TypeFilter,
  timeframe: FeedTimeframe,
  page: number
): Promise<FeedResponse> {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("page", page.toString());
  params.set("pageSize", "20");
  if (type !== "all") params.set("type", type);
  if (timeframe !== "all") params.set("timeframe", timeframe);

  const response = await fetch(`/api/feed?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load feed");
  }

  return (await response.json()) as FeedResponse;
}

function EndStateCard({ topics }: { topics: string[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
      <p className="text-base font-semibold text-gray-900">
        You&apos;re all caught up.
      </p>
      <p className="mt-1 text-sm text-gray-500">
        Explore what&apos;s happening in other topics.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {topics.map((topic) => (
          <Link
            key={topic}
            href={`/topics/${encodeURIComponent(topic)}`}
            className="rounded-full border border-gray-200 bg-canvas px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:text-ink"
          >
            + {topic}
          </Link>
        ))}
      </div>
      <Link
        href="/?tab=latest"
        className="mt-3 inline-block text-sm font-semibold text-emerald-brand hover:underline"
      >
        Or switch to Latest -&gt;
      </Link>
    </div>
  );
}

function deriveSuggestedTopics(posts: PostCardData[]) {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const tag of post.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([tag]) => tag);
}

function PostFeedSkeleton() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <article
          key={index}
          className="relative mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white px-3.5 py-3.5 sm:px-5 sm:py-[18px]"
        >
          <span className="absolute bottom-4 left-0 top-4 w-1 rounded-r-full bg-gray-200" />
          <div className="flex gap-3 pl-1 sm:gap-4">
            <div className="min-w-0 flex-1 animate-pulse">
              <div className="mb-3 flex items-center gap-2">
                <div className="h-5 w-16 rounded-full bg-gray-100" />
                <div className="h-3 w-14 rounded-full bg-gray-100" />
                <div className="h-5 w-20 rounded-full bg-gray-100" />
              </div>
              <div className="space-y-2">
                <div className="h-5 w-11/12 rounded bg-gray-100" />
                <div className="h-5 w-3/5 rounded bg-gray-100" />
              </div>
              <div className="mt-3 space-y-2 max-[359px]:hidden">
                <div className="h-3 w-full rounded bg-gray-100" />
                <div className="h-3 w-2/3 rounded bg-gray-100" />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-2.5">
                <div className="h-6 w-6 rounded-full bg-gray-100" />
                <div className="h-3 w-40 rounded bg-gray-100" />
              </div>
            </div>
            <div className="h-[84px] w-[84px] shrink-0 animate-pulse rounded-[10px] bg-gray-100 min-[420px]:h-[92px] min-[420px]:w-[92px] sm:h-[112px] sm:w-[112px]" />
          </div>
        </article>
      ))}
    </div>
  );
}

export default function PostsFeedTabs({
  initialTab,
  initialType,
  initialTimeframe,
  initialPosts,
  initialHasMore,
  showFollowingTab,
  activeDebate,
  peopleSuggestions,
  peopleSuggestionReason,
  prioritizePeopleSuggestions,
  currentUserId,
}: {
  initialTab: TabKey;
  initialType: TypeFilter;
  initialTimeframe: FeedTimeframe;
  initialPosts: PostCardData[];
  initialHasMore: boolean;
  showFollowingTab: boolean;
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
  currentUserId: string | null;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [timeframe, setTimeframe] = useState<FeedTimeframe>(initialTimeframe);
  const [feedCache, setFeedCache] = useState<Record<string, FeedCacheEntry>>(() => ({
    [feedCacheKey(initialTab, initialType, initialTimeframe)]: {
      posts: initialPosts,
      hasMore: initialHasMore,
      page: 1,
      emptyPageCount: initialPosts.length === 0 ? 1 : 0,
    },
  }));
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(new Map<string, Promise<FeedResponse>>());
  const activeRequestRef = useRef(0);
  const loadMoreRequestRef = useRef(0);

  useEffect(() => {
    const nextKey = feedCacheKey(initialTab, initialType, initialTimeframe);
    setActiveTab(initialTab);
    setTypeFilter(initialType);
    setTimeframe(initialTimeframe);
    setFeedCache((current) => ({
      ...current,
      [nextKey]: {
        posts: initialPosts,
        hasMore: initialHasMore,
        page: 1,
        emptyPageCount: initialPosts.length === 0 ? 1 : 0,
      },
    }));
    setIsSwitching(false);
    setIsLoadingMore(false);
    setError(null);
  }, [initialHasMore, initialPosts, initialTab, initialTimeframe, initialType]);

  const syncUrl = useCallback(
    (nextTab: TabKey, nextType: TypeFilter, nextTimeframe: FeedTimeframe) => {
      window.history.replaceState(
        null,
        "",
        buildFeedUrl(nextTab, nextType, nextTimeframe)
      );
    },
    []
  );

  const requestFeedPage = useCallback(
    (
      nextTab: TabKey,
      nextType: TypeFilter,
      nextTimeframe: FeedTimeframe,
      nextPage: number
    ) => {
      const key = feedCacheKey(nextTab, nextType, nextTimeframe);
      const requestKey = `${key}:${nextPage}`;
      const existing = inFlightRef.current.get(requestKey);
      if (existing) return existing;

      const request = fetchFeed(nextTab, nextType, nextTimeframe, nextPage).finally(
        () => {
          inFlightRef.current.delete(requestKey);
        }
      );
      inFlightRef.current.set(requestKey, request);
      return request;
    },
    []
  );

  const writeFeedPage = useCallback(
    (
      key: string,
      result: FeedResponse,
      nextPage: number,
      append: boolean
    ) => {
      setFeedCache((current) => {
        const previous = current[key];
        const emptyPageCount =
          result.posts.length === 0
            ? nextPage === 1
              ? 1
              : (previous?.emptyPageCount ?? 0) + 1
            : 0;

        return {
          ...current,
          [key]: {
            posts: append ? [...(previous?.posts ?? []), ...result.posts] : result.posts,
            hasMore: result.hasMore,
            page: nextPage,
            emptyPageCount,
          },
        };
      });
    },
    []
  );

  const reloadFeed = useCallback(
    async (
      nextTab: TabKey,
      nextType: TypeFilter,
      nextTimeframe: FeedTimeframe,
      {
        requestId,
        showError,
        showSkeleton,
      }: {
        requestId: number;
        showError: boolean;
        showSkeleton: boolean;
      }
    ) => {
      const key = feedCacheKey(nextTab, nextType, nextTimeframe);
      if (showSkeleton) setIsSwitching(true);
      try {
        const result = await requestFeedPage(nextTab, nextType, nextTimeframe, 1);
        writeFeedPage(key, result, 1, false);
      } catch (fetchError) {
        if (activeRequestRef.current === requestId && showError) {
          setError(
            fetchError instanceof Error ? fetchError.message : "Failed to load feed"
          );
        }
      } finally {
        if (activeRequestRef.current === requestId && showSkeleton) {
          setIsSwitching(false);
        }
      }
    },
    [requestFeedPage, writeFeedPage]
  );

  const updateState = useCallback(
    (nextTab: TabKey, nextType: TypeFilter, nextTimeframe: FeedTimeframe) => {
      const nextKey = feedCacheKey(nextTab, nextType, nextTimeframe);
      const hasCachedFeed = Boolean(feedCache[nextKey]);
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;

      setActiveTab(nextTab);
      setTypeFilter(nextType);
      setTimeframe(nextTimeframe);
      setError(null);
      setIsSwitching(!hasCachedFeed);
      syncUrl(nextTab, nextType, nextTimeframe);
      void reloadFeed(nextTab, nextType, nextTimeframe, {
        requestId,
        showError: !hasCachedFeed,
        showSkeleton: !hasCachedFeed,
      });
    },
    [feedCache, reloadFeed, syncUrl]
  );

  const loadMore = useCallback(async () => {
    const key = feedCacheKey(activeTab, typeFilter, timeframe);
    const currentFeed = feedCache[key];
    if (isSwitching || isLoadingMore || !currentFeed?.hasMore) return;

    const requestId = loadMoreRequestRef.current + 1;
    loadMoreRequestRef.current = requestId;
    setIsLoadingMore(true);
    setError(null);
    try {
      const nextPage = currentFeed.page + 1;
      const result = await requestFeedPage(activeTab, typeFilter, timeframe, nextPage);
      writeFeedPage(key, result, nextPage, true);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load feed"
      );
    } finally {
      if (loadMoreRequestRef.current === requestId) {
        setIsLoadingMore(false);
      }
    }
  }, [
    activeTab,
    feedCache,
    isLoadingMore,
    isSwitching,
    requestFeedPage,
    timeframe,
    typeFilter,
    writeFeedPage,
  ]);

  useEffect(() => {
    const tabsToPrefetch: TabKey[] = currentUserId
      ? showFollowingTab
        ? ["following", "latest"]
        : ["latest"]
      : ["latest"];

    for (const tab of tabsToPrefetch) {
      const key = feedCacheKey(tab, typeFilter, timeframe);
      if (tab === activeTab || feedCache[key]) continue;

      void requestFeedPage(tab, typeFilter, timeframe, 1)
        .then((result) => {
          writeFeedPage(key, result, 1, false);
        })
        .catch(() => {
          // Prefetch failures should not interrupt the active feed.
        });
    }
  }, [
    activeTab,
    currentUserId,
    feedCache,
    requestFeedPage,
    showFollowingTab,
    timeframe,
    typeFilter,
    writeFeedPage,
  ]);

  useEffect(() => {
    const currentFeed = feedCache[feedCacheKey(activeTab, typeFilter, timeframe)];
    if (!sentinelRef.current || !currentFeed?.hasMore || isSwitching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "400px 0px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [activeTab, feedCache, isSwitching, loadMore, timeframe, typeFilter]);

  const activeKey = feedCacheKey(activeTab, typeFilter, timeframe);
  const currentFeed = feedCache[activeKey];
  const posts = currentFeed?.posts ?? EMPTY_POSTS;
  const hasMore = currentFeed?.hasMore ?? false;
  const emptyPageCount = currentFeed?.emptyPageCount ?? 0;
  const suggestedTopics = useMemo(() => deriveSuggestedTopics(posts), [posts]);
  const showSkeleton = isSwitching && !currentFeed;
  const showEndState =
    !showSkeleton && !isLoadingMore && posts.length > 0 && (!hasMore || emptyPageCount >= 3);

  return (
    <div>
      <div className="mb-4 grid w-full grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-1 rounded-xl border border-gray-200 bg-white p-1.5 min-[420px]:inline-grid min-[420px]:w-auto min-[420px]:grid-cols-none min-[420px]:auto-cols-fr min-[420px]:grid-flow-col sm:mb-5">
        {(["home", "following", "latest"] as const)
          .filter((tab) => tab !== "following" || showFollowingTab)
          .map((tab) => {
            const label =
              tab === "home" ? "For you" : tab === "following" ? "Following" : "Latest";
            return (
              <button
                key={tab}
                type="button"
                onClick={() => updateState(tab, typeFilter, timeframe)}
                className={`min-h-10 rounded-[8px] px-3 py-2 text-[13px] font-semibold transition-colors sm:px-3.5 ${
                  activeTab === tab
                    ? "bg-canvas text-ink"
                    : "text-gray-500 hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
      </div>

      <FeedFilterChips
        type={typeFilter}
        onTypeChange={(nextType) => updateState(activeTab, nextType, timeframe)}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div aria-busy={showSkeleton || isLoadingMore}>
        {showSkeleton ? (
          <PostFeedSkeleton />
        ) : (
          <PostFeed
            posts={posts}
            activeTab={activeTab}
            activeDebate={activeDebate}
            peopleSuggestions={peopleSuggestions}
            peopleSuggestionReason={peopleSuggestionReason}
            prioritizePeopleSuggestions={prioritizePeopleSuggestions}
            currentUserId={currentUserId}
          />
        )}
      </div>

      {isLoadingMore ? (
        <div className="py-6 text-center text-sm text-gray-400">Loading more...</div>
      ) : null}

      {showEndState ? (
        <div className="mt-6">
          <EndStateCard topics={suggestedTopics} />
        </div>
      ) : null}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
