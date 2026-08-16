"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PostFeed from "@/components/post/PostFeed";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { PostCardData } from "@/components/post/PostCard";
import type { FeedContentFilter, FeedTimeframe } from "@/lib/feedData";
import type { SubscriptionFeedSource } from "@/lib/publicationDelivery";
import HomeFeaturedLead, { type HomeFeaturedPost } from "@/components/post/HomeFeaturedLead";
import HomeGuestNotice from "./HomeGuestNotice";
import FeedEmptyState from "./FeedEmptyState";
import FeedErrorState from "./FeedErrorState";
import CreateTrigger from "./CreateTrigger";
import { useStickySubnav } from "@/lib/useStickySubnav";
import { useAppChrome } from "./AppChromeProvider";

type TabKey = "home" | "following" | "subscriptions" | "topics" | "latest";
const EMPTY_POSTS: PostCardData[] = [];

const CREATE_CTA_CLASS =
  "inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";
const SECONDARY_CTA_CLASS =
  "inline-flex min-h-11 items-center rounded-lg border border-divider bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

const TAB_ORDER = [
  "home",
  "following",
  "subscriptions",
  "topics",
  "latest",
] as const;

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
  timeframe: FeedTimeframe,
  source: SubscriptionFeedSource
) {
  return `${tab}:${type}:${timeframe}:${tab === "subscriptions" ? source : "all"}`;
}

function buildFeedUrl(
  tab: TabKey,
  type: FeedContentFilter,
  timeframe: FeedTimeframe,
  source: SubscriptionFeedSource
) {
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
  if (tab === "subscriptions" && source !== "all") {
    params.set("source", source);
  } else {
    params.delete("source");
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function fetchFeed(
  tab: TabKey,
  type: FeedContentFilter,
  timeframe: FeedTimeframe,
  page: number,
  source: SubscriptionFeedSource
): Promise<FeedResponse> {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("page", page.toString());
  params.set("pageSize", "12");
  if (type !== "all") params.set("type", type);
  if (timeframe !== "all") params.set("timeframe", timeframe);
  if (tab === "subscriptions") params.set("source", source);

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
      <span aria-hidden="true" className="mb-1 h-px w-8 bg-divider" />
      {/* Both lines are ink-muted. The second used to be gray-400 (#9CA3AF),
          which is 2.8:1 on white -- under the 4.5:1 floor, at 12px. The
          hierarchy between the two lines is carried by weight and size now
          rather than by fading the lower one out of legibility. */}
      <p className="text-byline font-medium text-ink-muted">You&apos;re all caught up.</p>
      <p className="text-meta text-ink-muted">New posts will appear here as they&apos;re published.</p>
    </div>
  );
}

export default function PostsFeedTabs({
  initialTab,
  initialType,
  initialTimeframe,
  initialPosts,
  initialHasMore,
  initialSubscriptionSource = "all",
  showFollowingTab,
  showTopicsTab = false,
  showSubscriptionsTab = false,
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
  initialSubscriptionSource?: SubscriptionFeedSource;
  showFollowingTab: boolean;
  showTopicsTab?: boolean;
  showSubscriptionsTab?: boolean;
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
  const { mode: chromeMode, navHeight, revealChrome } = useAppChrome();
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [typeFilter, setTypeFilter] = useState<FeedContentFilter>(initialType);
  const [timeframe, setTimeframe] = useState<FeedTimeframe>(initialTimeframe);
  const [subscriptionSource, setSubscriptionSource] =
    useState<SubscriptionFeedSource>(initialSubscriptionSource);
  const [feedCache, setFeedCache] = useState<Record<string, FeedCacheEntry>>(() => ({
    [feedCacheKey(
      initialTab,
      initialType,
      initialTimeframe,
      initialSubscriptionSource
    )]: {
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
  const [isPinned, setIsPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedTopRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(new Map<string, Promise<FeedResponse>>());
  const activeRequestRef = useRef(0);
  const loadMoreRequestRef = useRef(0);

  // Lets the control strip retreat off the top with the nav rather than
  // staying glued there once the nav is gone.
  useStickySubnav(stripRef, feedTopRef);

  useEffect(() => {
    const nextKey = feedCacheKey(
      initialTab,
      initialType,
      initialTimeframe,
      initialSubscriptionSource
    );
    setActiveTab(initialTab);
    setTypeFilter(initialType);
    setTimeframe(initialTimeframe);
    setSubscriptionSource(initialSubscriptionSource);
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
  }, [
    initialHasMore,
    initialPosts,
    initialSubscriptionSource,
    initialTab,
    initialTimeframe,
    initialType,
  ]);

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
      nextTimeframe: FeedTimeframe,
      nextSource: SubscriptionFeedSource
    ) => {
      window.history.replaceState(
        null,
        "",
        buildFeedUrl(nextTab, nextType, nextTimeframe, nextSource)
      );
    },
    []
  );

  const requestFeedPage = useCallback(
    (
      nextTab: TabKey,
      nextType: FeedContentFilter,
      nextTimeframe: FeedTimeframe,
      nextPage: number,
      nextSource: SubscriptionFeedSource
    ) => {
      const key = feedCacheKey(
        nextTab,
        nextType,
        nextTimeframe,
        nextSource
      );
      const requestKey = `${key}:${nextPage}`;
      const existing = inFlightRef.current.get(requestKey);
      if (existing) return existing;

      const request = fetchFeed(
        nextTab,
        nextType,
        nextTimeframe,
        nextPage,
        nextSource
      ).finally(() => {
          inFlightRef.current.delete(requestKey);
        });
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

        // Every date-ordered tab pages by offset, so a post published between
        // two requests slides the whole window down by one and hands back a
        // card that is already on screen -- rendered twice, under a duplicate
        // React key. Appending by id rather than by concatenation makes the
        // list idempotent no matter what the window did underneath it.
        const carried = append ? (previous?.posts ?? []) : [];
        const seen = new Set(carried.map((post) => post.id));
        const added = result.posts.filter((post) => {
          if (seen.has(post.id)) return false;
          seen.add(post.id);
          return true;
        });

        // Counted from what actually landed, not from what the response
        // contained: a page of nothing but posts we already have moves the
        // reader forward exactly as little as an empty one, and three of those
        // in a row is the end of the feed however it got that way.
        const emptyPageCount =
          added.length === 0
            ? nextPage === 1
              ? 1
              : (previous?.emptyPageCount ?? 0) + 1
            : 0;

        return {
          ...current,
          [key]: {
            posts: append ? [...carried, ...added] : added,
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
      nextSource: SubscriptionFeedSource,
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
      const key = feedCacheKey(
        nextTab,
        nextType,
        nextTimeframe,
        nextSource
      );
      if (showSkeleton) setIsSwitching(true);
      if (showError) setInitialError(false);
      try {
        const result = await requestFeedPage(
          nextTab,
          nextType,
          nextTimeframe,
          1,
          nextSource
        );
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

  // Switching tabs swaps the entire list underneath a scroll position that was
  // meaningful for the old one. Landing five screens deep in a different (often
  // shorter) feed is what makes the tabs feel stuck. Snap back to the top of
  // the feed -- but only when the reader is already below it, so switching
  // tabs from the top of the page never yanks the viewport.
  const scrollFeedToTop = useCallback(() => {
    const anchor = feedTopRef.current;
    if (!anchor || typeof window === "undefined") return;

    // The measured height, not the live offset. This scroll always moves
    // upward, and an upward scroll is exactly what brings the nav back -- so by
    // the time the tab's new cards are on screen there is a full nav bar at the
    // top again, and the marker has to land below it. Reserving only the
    // retreated offset (0) would park the strip's natural position at the very
    // top, where the revealed nav then overlaps the first card.
    revealChrome({ immediate: true });
    const target = Math.max(
      window.scrollY + anchor.getBoundingClientRect().top - navHeight,
      0
    );
    if (window.scrollY <= target) return;
    // Instant, not smooth: a tab switch should already be at the top by the
    // time the new cards paint, not animating past the old ones.
    window.scrollTo({ top: target, behavior: "auto" });
  }, [navHeight, revealChrome]);

  const updateState = useCallback(
    (
      nextTab: TabKey,
      nextType: FeedContentFilter,
      nextTimeframe: FeedTimeframe,
      nextSource: SubscriptionFeedSource = subscriptionSource
    ) => {
      const nextKey = feedCacheKey(
        nextTab,
        nextType,
        nextTimeframe,
        nextSource
      );
      const hasCachedFeed = Boolean(feedCache[nextKey]);
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;

      setActiveTab(nextTab);
      setTypeFilter(nextType);
      setTimeframe(nextTimeframe);
      setSubscriptionSource(nextSource);
      setInitialError(false);
      setPaginationError(false);
      setIsSwitching(!hasCachedFeed);
      scrollFeedToTop();
      syncUrl(nextTab, nextType, nextTimeframe, nextSource);
      void reloadFeed(nextTab, nextType, nextTimeframe, nextSource, {
        requestId,
        showError: !hasCachedFeed,
        showSkeleton: !hasCachedFeed,
      });
    },
    [feedCache, reloadFeed, scrollFeedToTop, subscriptionSource, syncUrl]
  );

  const retryInitial = useCallback(() => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    void reloadFeed(activeTab, typeFilter, timeframe, subscriptionSource, {
      requestId,
      showError: true,
      showSkeleton: true,
    });
  }, [activeTab, typeFilter, timeframe, subscriptionSource, reloadFeed]);

  const loadMore = useCallback(async () => {
    const key = feedCacheKey(
      activeTab,
      typeFilter,
      timeframe,
      subscriptionSource
    );
    const currentFeed = feedCache[key];
    if (isSwitching || isLoadingMore || !currentFeed?.hasMore) return;
    // The sentinel is 400px tall in effect and re-arms on every cache write, so
    // a `hasMore` that never turns false would page forever. Three pages that
    // added nothing is the same signal the end-state card reads.
    if (currentFeed.emptyPageCount >= 3) return;

    const requestId = loadMoreRequestRef.current + 1;
    loadMoreRequestRef.current = requestId;
    setIsLoadingMore(true);
    setPaginationError(false);
    try {
      const nextPage = currentFeed.page + 1;
      const result = await requestFeedPage(
        activeTab,
        typeFilter,
        timeframe,
        nextPage,
        subscriptionSource
      );
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
    subscriptionSource,
    timeframe,
    typeFilter,
    writeFeedPage,
  ]);

  useEffect(() => {
    const currentFeed =
      feedCache[
        feedCacheKey(activeTab, typeFilter, timeframe, subscriptionSource)
      ];
    if (!sentinelRef.current || !currentFeed?.hasMore || isSwitching) return;
    if (currentFeed.emptyPageCount >= 3) return;

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
  }, [
    activeTab,
    feedCache,
    isSwitching,
    loadMore,
    subscriptionSource,
    timeframe,
    typeFilter,
  ]);

  // Track whether the control strip is currently pinned, so its bottom edge
  // only appears while cards are actually passing beneath it -- a permanent
  // shadow reads as a bar floating over nothing when the page is at rest.
  //
  // feedTopRef is the non-sticky marker just above the strip, so it leaves the
  // viewport at exactly the moment the strip pins. Watching it costs one
  // IntersectionObserver instead of a layout read on every scroll event.
  useEffect(() => {
    const anchor = feedTopRef.current;
    if (!anchor || typeof IntersectionObserver === "undefined") return;

    // Deliberately the measured height, frozen at mount, rather than the live
    // --app-nav-offset: this gates the strip's shadow, not its position, and
    // rebuilding the observer on every hide/reveal would fire a fresh initial
    // callback each time and flicker it. With the nav retreated the shadow
    // turns on a little early, which is past the point anyone is looking.
    const navHeight =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-nav-height")
      ) || 0;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsPinned(!entry.isIntersecting);
      },
      { rootMargin: `-${navHeight}px 0px 0px 0px`, threshold: 0 }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  const activeKey = feedCacheKey(
    activeTab,
    typeFilter,
    timeframe,
    subscriptionSource
  );
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

  const visibleTabs = TAB_ORDER.filter(
    (tab) =>
      (tab !== "following" || showFollowingTab) &&
      (tab !== "topics" || showTopicsTab) &&
      (tab !== "subscriptions" || showSubscriptionsTab)
  );

  /**
   * Arrow-key navigation for the tablist. The row already declared
   * `role="tablist"` and `role="tab"`, which tells assistive technology that
   * Left/Right move between tabs -- but nothing implemented it, so a keyboard
   * user got the promise without the behaviour and had to Tab through every
   * control instead. Paired with the roving `tabIndex` below, which takes the
   * inactive tabs out of the Tab sequence so the whole row is one stop.
   *
   * Activation follows focus, matching what a click already does.
   */
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = visibleTabs.indexOf(activeTab);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % visibleTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = visibleTabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
    if (!nextTab || nextTab === activeTab) return;
    document.getElementById(`feed-tab-${nextTab}`)?.focus();
    updateState(nextTab, typeFilter, timeframe);
  };

  let emptyTitle = "No content yet.";
  let emptyBody = "Be the first to share your ideas with Africa.";
  let emptyCta = (
    <CreateTrigger userId={currentUserId} className={CREATE_CTA_CLASS}>
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
  } else if (activeTab === "topics") {
    emptyTitle = "No posts from your subscribed topics yet.";
    emptyBody =
      "Subscribe to topics to build a feed around the subjects you care about.";
    emptyCta = (
      <Link href="/topics" className={CREATE_CTA_CLASS}>
        Explore topics
      </Link>
    );
  } else if (activeTab === "subscriptions") {
    emptyTitle = "No publications from your subscriptions yet.";
    emptyBody =
      "Subscribe to writers or topics to build a feed around the ideas you care about.";
    emptyCta = (
      <Link href="/subscriptions" className={CREATE_CTA_CLASS}>
        Manage subscriptions
      </Link>
    );
  }

  return (
    <div>
      {!currentUserId ? <HomeGuestNotice /> : null}

      {/* Honest (non-sticky) marker for where the feed controls sit in the
          document -- the sticky wrapper's own rect lies once it is pinned. */}
      <div ref={feedTopRef} aria-hidden="true" />

      {/* Tabs and filter chips pin together as one block. Splitting them let
          the chips slide up under the tabs, which read as the header breaking
          apart mid-scroll. Each row is fully opaque (not bg-white/95) so cards
          passing beneath don't ghost through whichever rows are showing.

          Pinned beneath the nav while the nav is there, and at the very top of
          the viewport once it isn't: scrolling down hands the entire screen to
          the posts, scrolling up brings tabs, chips and nav back together in
          one movement. The sticky offset comes from the shared
          [data-app-context-nav] rule, which tracks the nav's live occupancy --
          pinning at a fixed offset and translating the strip up instead would
          leave its reserved flow space behind, where it is no use to anyone.

          The wrapper paints nothing and swallows no taps; each row carries its
          own full-bleed background and padding. Backgrounding the wrapper
          would put a white band where the filter row collapses away, and
          padding it inset those backgrounds from the screen edge, leaving
          gutters for cards to ghost through.

          The bottom edge only appears once pinned: without it a card sliding
          under the strip looked sliced rather than layered. The border is
          always in the box (transparent at rest) so gaining it costs no 1px
          reflow. */}
      <div
        ref={stripRef}
        data-app-context-nav=""
        data-app-chrome-motion=""
        className="pointer-events-none z-30 -mx-4 mb-3 w-[calc(100%+2rem)] sm:mx-0 sm:w-full"
      >
        <div
          data-app-context-primary=""
          className={`pointer-events-auto flex gap-1 overflow-x-auto overscroll-x-contain border-b border-divider bg-card px-4 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden ${
            isPinned && chromeMode === "compact"
              ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]"
              : ""
          }`}
          role="tablist"
          aria-label="Choose feed"
          onKeyDown={handleTabKeyDown}
        >
          {visibleTabs.map((tab) => {
            const label =
              tab === "home"
                ? currentUserId
                  ? "For you"
                  : "Discover"
                : tab === "following"
                  ? "Following"
                  : tab === "subscriptions"
                    ? "Subscribed"
                  : tab === "topics"
                    ? "Topics"
                    : "Latest";
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`feed-tab-${tab}`}
                aria-controls="home-feed-panel"
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => updateState(tab, typeFilter, timeframe)}
                // Underline only. These carried a `bg-green-tint/70` fill as
                // well, which made the active tab read as a pressed button
                // sitting in a box -- the same doubled-signal problem the feed
                // cards had, and the reason two stacked control rows looked
                // like two competing systems. The underline was already here
                // and is sufficient on its own; X and Medium both settled on
                // exactly this for the same job. Tabs are navigation, not an
                // action, so they should be the quietest thing on the page.
                className={`-mb-px min-h-11 shrink-0 border-b-2 px-3.5 py-2 text-byline font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:px-4 ${
                  activeTab === tab
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          data-app-context-expanded=""
          data-app-chrome-motion=""
          aria-hidden={chromeMode === "compact" || undefined}
          inert={chromeMode === "compact" || undefined}
          className={`pointer-events-auto border-b bg-card ${
            isPinned && chromeMode === "expanded"
              ? "border-divider shadow-[0_1px_12px_rgb(0,0,0,0.08)]"
              : "border-transparent"
          }`}
        >
          {/* Both wrappers are load-bearing. The outer one is the grid row the
              shared rule clips to nothing (its overflow:hidden comes from
              there); the inner one holds the padding, which a border-box row
              cannot collapse below. */}
          <div>
            <div className="px-4 pb-1 sm:px-0">
              {activeTab === "subscriptions" ? (
                <div
                  className="flex gap-2 overflow-x-auto pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-label="Filter subscriptions"
                >
                  {(["all", "authors", "topics"] as const).map((source) => (
                    <button
                      key={source}
                      type="button"
                      aria-pressed={subscriptionSource === source}
                      onClick={() =>
                        updateState(activeTab, typeFilter, timeframe, source)
                      }
                      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
                        subscriptionSource === source
                          ? "border-emerald-brand bg-emerald-brand text-white"
                          : "border-divider bg-card text-ink-muted hover:border-emerald-ink hover:text-emerald-ink"
                      }`}
                    >
                      {source}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* The All / Posts / Articles / Research chips used to sit here.
                  They now live only on Explore, which already offered the same
                  four filters plus a genre refinement (General / Essay /
                  Policy Brief) that this row never had -- so this was the
                  weaker of two copies, charging every visitor a second row of
                  chrome for a filter most of them never touch.

                  Splitting it that way also splits the job cleanly: Home is
                  where you go to be surprised, Explore is where you go looking
                  for something specific, and narrowing to one content kind is
                  a seeking action. `/?type=` links hand off to Explore (see
                  app/(main)/page.tsx) so old bookmarks keep their intent.

                  `typeFilter` is deliberately still threaded through this
                  component. The feed API and fetchFeedPage still accept a
                  content filter, the empty states still describe one, and the
                  prop is still part of this component's contract -- home just
                  never sets it to anything but "all" now. Ripping the plumbing
                  out is a separate, larger change. */}
            </div>
          </div>
        </div>
      </div>

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

      {/* The same skeleton the first load uses, rather than a line of grey
          text. It holds the height the incoming cards will occupy instead of
          collapsing to one row, so the scroll position stays put when they
          land, and it keeps the two loading states looking like one product. */}
      {isLoadingMore ? (
        <>
          <span className="sr-only" role="status" aria-live="polite">
            Loading more posts
          </span>
          <FeedSkeleton count={2} />
        </>
      ) : null}

      {paginationError ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center dark:border-red-900 dark:bg-red-950/40"
        >
          <p className="text-sm text-red-700 dark:text-red-300">Couldn&apos;t load more.</p>
          <button
            type="button"
            onClick={() => {
              void loadMore();
            }}
            disabled={isLoadingMore}
            className="text-sm font-semibold text-red-700 underline decoration-red-300 underline-offset-2 disabled:opacity-60 dark:text-red-300 dark:decoration-red-700"
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
