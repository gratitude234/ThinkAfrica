"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PostFeed from "@/components/post/PostFeed";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { PostCardData } from "@/components/post/PostCard";
import type { FeedContentFilter, FeedTimeframe } from "@/lib/feedData";
import FeedFilterChips from "./FeedFilterChips";
import HomeFeaturedLead, { type HomeFeaturedPost } from "@/components/post/HomeFeaturedLead";
import HomeGuestNotice from "./HomeGuestNotice";
import FeedEmptyState from "./FeedEmptyState";
import FeedErrorState from "./FeedErrorState";
import CreateTrigger from "./CreateTrigger";

type TabKey = "home" | "following" | "latest";
const EMPTY_POSTS: PostCardData[] = [];

const CREATE_CTA_CLASS =
  "inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";
const SECONDARY_CTA_CLASS =
  "inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

const CONTENT_KIND_PLURAL: Record<Exclude<FeedContentFilter, "all">, string> = {
  post: "Posts",
  article: "Articles",
  research: "Research",
};

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
  type: FeedContentFilter,
  timeframe: FeedTimeframe
) {
  return `${tab}:${type}:${timeframe}`;
}

function buildFeedUrl(tab: TabKey, type: FeedContentFilter, timeframe: FeedTimeframe) {
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
  type: FeedContentFilter,
  timeframe: FeedTimeframe,
  page: number
): Promise<FeedResponse> {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("page", page.toString());
  params.set("pageSize", "12");
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

export function EndStateCard() {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span aria-hidden="true" className="mb-1 h-px w-8 bg-gray-200" />
      <p className="text-[13.5px] font-medium text-gray-500">You&apos;re all caught up.</p>
      <p className="text-[12px] text-gray-400">New posts will appear here as they&apos;re published.</p>
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
  featuredPost,
}: {
  initialTab: TabKey;
  initialType: FeedContentFilter;
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
  featuredPost?: HomeFeaturedPost | null;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [typeFilter, setTypeFilter] = useState<FeedContentFilter>(initialType);
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
  // Two distinct failure modes: initialError replaces the panel with a
  // full retry state (nothing loaded yet for this tab/filter), while
  // paginationError leaves every already-loaded card in place and only
  // adds a compact inline retry banner at the bottom.
  const [initialError, setInitialError] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
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
    setInitialError(false);
    setPaginationError(false);
  }, [initialHasMore, initialPosts, initialTab, initialTimeframe, initialType]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentType = params.get("type");
    const canonicalType = initialType === "all" ? null : initialType;
    if (currentType === canonicalType) return;

    if (canonicalType) params.set("type", canonicalType);
    else params.delete("type");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname
    );
  }, [initialType]);

  const syncUrl = useCallback(
    (
      nextTab: TabKey,
      nextType: FeedContentFilter,
      nextTimeframe: FeedTimeframe
    ) => {
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
      nextType: FeedContentFilter,
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
      nextType: FeedContentFilter,
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
      if (showError) setInitialError(false);
      try {
        const result = await requestFeedPage(nextTab, nextType, nextTimeframe, 1);
        writeFeedPage(key, result, 1, false);
      } catch {
        if (activeRequestRef.current === requestId && showError) {
          setInitialError(true);
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
    (nextTab: TabKey, nextType: FeedContentFilter, nextTimeframe: FeedTimeframe) => {
      const nextKey = feedCacheKey(nextTab, nextType, nextTimeframe);
      const hasCachedFeed = Boolean(feedCache[nextKey]);
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;

      setActiveTab(nextTab);
      setTypeFilter(nextType);
      setTimeframe(nextTimeframe);
      setInitialError(false);
      setPaginationError(false);
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

  const retryInitial = useCallback(() => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    void reloadFeed(activeTab, typeFilter, timeframe, {
      requestId,
      showError: true,
      showSkeleton: true,
    });
  }, [activeTab, typeFilter, timeframe, reloadFeed]);

  const loadMore = useCallback(async () => {
    const key = feedCacheKey(activeTab, typeFilter, timeframe);
    const currentFeed = feedCache[key];
    if (isSwitching || isLoadingMore || !currentFeed?.hasMore) return;

    const requestId = loadMoreRequestRef.current + 1;
    loadMoreRequestRef.current = requestId;
    setIsLoadingMore(true);
    setPaginationError(false);
    try {
      const nextPage = currentFeed.page + 1;
      const result = await requestFeedPage(activeTab, typeFilter, timeframe, nextPage);
      writeFeedPage(key, result, nextPage, true);
    } catch {
      if (loadMoreRequestRef.current === requestId) {
        setPaginationError(true);
      }
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
  const showSkeleton = isSwitching && !currentFeed;
  const showEmpty = !initialError && !showSkeleton && posts.length === 0;
  const showFeedList = !initialError && !showSkeleton && posts.length > 0;
  const showEndState =
    showFeedList && !isLoadingMore && (!hasMore || emptyPageCount >= 3);
  const showFeaturedLead =
    activeTab === "home" && typeFilter === "all" && Boolean(featuredPost) && !initialError && !showSkeleton;
  // The featured lead already shows this record above the feed -- don't
  // render it a second time in the list immediately below it.
  const visiblePosts = showFeaturedLead
    ? posts.filter((candidate) => candidate.id !== featuredPost?.id)
    : posts;

  const resetFilterToAll = () => updateState(activeTab, "all", timeframe);

  let emptyTitle = "No content yet.";
  let emptyBody = "Be the first to share your ideas with Africa.";
  let emptyCta = (
    <CreateTrigger userId={currentUserId} presentation="popover" className={CREATE_CTA_CLASS}>
      Create
    </CreateTrigger>
  );

  if (typeFilter !== "all") {
    const kindLabel = CONTENT_KIND_PLURAL[typeFilter];
    emptyTitle = `No ${kindLabel} here yet.`;
    emptyBody = "Try All to see everything in this feed.";
    emptyCta = (
      <button type="button" onClick={resetFilterToAll} className={SECONDARY_CTA_CLASS}>
        View all
      </button>
    );
  } else if (activeTab === "following") {
    emptyTitle = "No posts from writers you follow yet.";
    emptyBody = "Follow writers to build a feed around the ideas you care about.";
    emptyCta = (
      <Link href="/onboarding?step=follow" className={CREATE_CTA_CLASS}>
        Explore writers
      </Link>
    );
  }

  return (
    <div>
      {!currentUserId ? <HomeGuestNotice /> : null}

      <div
        className="sticky top-[84px] z-30 -mx-4 mb-3 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto border-b border-gray-200 bg-white/95 px-4 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:w-full sm:px-0"
        role="tablist"
        aria-label="Choose feed"
      >
        {(["home", "following", "latest"] as const)
          .filter((tab) => tab !== "following" || showFollowingTab)
          .map((tab) => {
            const label =
              tab === "home"
                ? currentUserId
                  ? "For you"
                  : "Discover"
                : tab === "following"
                  ? "Following"
                  : "Latest";
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`feed-tab-${tab}`}
                aria-controls="home-feed-panel"
                aria-selected={activeTab === tab}
                onClick={() => updateState(tab, typeFilter, timeframe)}
                className={`-mb-px min-h-11 shrink-0 border-b-2 px-3.5 py-2 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
                  activeTab === tab
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-gray-500 hover:text-ink"
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

      {showFeaturedLead && featuredPost ? <HomeFeaturedLead post={featuredPost} /> : null}

      <div
        id="home-feed-panel"
        role="tabpanel"
        aria-labelledby={`feed-tab-${activeTab}`}
        aria-busy={showSkeleton || isLoadingMore}
      >
        {initialError ? (
          <FeedErrorState onRetry={retryInitial} />
        ) : showSkeleton ? (
          <FeedSkeleton />
        ) : showEmpty ? (
          <FeedEmptyState title={emptyTitle} body={emptyBody} cta={emptyCta} />
        ) : (
          <PostFeed
            posts={visiblePosts}
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

      {paginationError ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center"
        >
          <p className="text-sm text-red-700">Couldn&apos;t load more.</p>
          <button
            type="button"
            onClick={() => {
              void loadMore();
            }}
            disabled={isLoadingMore}
            className="text-sm font-semibold text-red-700 underline decoration-red-300 underline-offset-2 disabled:opacity-60"
          >
            Try again
          </button>
        </div>
      ) : null}

      {showEndState ? <EndStateCard /> : null}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
