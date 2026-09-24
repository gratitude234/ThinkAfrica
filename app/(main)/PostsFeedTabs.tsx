"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PostFeed from "@/components/post/PostFeed";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import type { PostCardData } from "@/components/post/PostCard";
import {
  HOME_FEED_TAB_LABELS,
  visibleHomeFeedTabs,
  type HomeFeedTab,
} from "@/lib/homeFeedTabs";
import HomeGuestNotice from "./HomeGuestNotice";
import FeedEmptyState from "./FeedEmptyState";
import FeedErrorState from "./FeedErrorState";
import { useStickySubnav } from "@/lib/useStickySubnav";
import { useAppChrome } from "./AppChromeProvider";

const EMPTY_POSTS: PostCardData[] = [];
const PAGE_SIZE = 12;
const FEED_CACHE_FRESH_MS = 60_000;
const NEW_POST_CLOCK_SKEW_MS = 5_000;
const FEED_TOP_TOLERANCE_PX = 24;

const CTA_CLASS =
  "inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

interface FeedResponse {
  posts: PostCardData[];
  hasMore: boolean;
  nextCursor?: string | null;
}

class FeedRequestError extends Error {
  constructor(
    readonly code: string | null,
    readonly status: number
  ) {
    super("Failed to load feed");
    this.name = "FeedRequestError";
  }
}

interface FeedCacheEntry extends FeedResponse {
  page: number;
  emptyPageCount: number;
  feedSessionId: string;
  loadedSuccessfully: boolean;
  lastCheckedAt: number;
}

interface FreshFeedCandidate {
  result: FeedResponse;
  feedSessionId: string;
}

function postPublishedAtMs(post: PostCardData) {
  const value = post.published_at ?? post.created_at;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function containsNewlyPublishedPosts(
  current: FeedCacheEntry,
  incoming: PostCardData[]
) {
  if (incoming.length === 0) return false;
  const existingIds = new Set(current.posts.map((post) => post.id));
  const publishedAfter = current.lastCheckedAt - NEW_POST_CLOCK_SKEW_MS;

  return incoming.some(
    (post) =>
      !existingIds.has(post.id) && postPublishedAtMs(post) >= publishedAfter
  );
}

function buildFeedUrl(tab: HomeFeedTab) {
  const params = new URLSearchParams(window.location.search);
  if (tab === "following") {
    params.set("tab", "following");
  } else {
    params.delete("tab");
  }
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

async function fetchFeed(
  tab: HomeFeedTab,
  page: number,
  feedSessionId: string,
  cursor: string | null
): Promise<FeedResponse> {
  const params = new URLSearchParams();
  params.set("tab", tab);
  params.set("page", page.toString());
  params.set("pageSize", String(PAGE_SIZE));
  params.set("session", feedSessionId);
  if (cursor) params.set("cursor", cursor);

  const response = await fetch(`/api/feed?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { code?: unknown };
    } | null;
    const code =
      typeof payload?.error?.code === "string" ? payload.error.code : null;
    throw new FeedRequestError(code, response.status);
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

/** What each mode says when it has nothing to show. One line, one link. */
export function HomeFeedEmptyState({ tab }: { tab: HomeFeedTab }) {
  if (tab === "following") {
    return (
      <FeedEmptyState
        title="Follow writers to see their Posts and Articles here."
        cta={
          <Link href="/explore?tab=people" className={CTA_CLASS}>
            Explore writers
          </Link>
        }
      />
    );
  }
  return <FeedEmptyState title="No publications to show yet." />;
}

export default function PostsFeedTabs({
  initialTab,
  initialPosts,
  initialHasMore,
  initialNextCursor = null,
  initialLoadFailed = false,
  currentUserId,
}: {
  initialTab: HomeFeedTab;
  initialPosts: PostCardData[];
  initialHasMore: boolean;
  initialNextCursor?: string | null;
  initialLoadFailed?: boolean;
  currentUserId: string | null;
}) {
  const { navHeight, revealChrome } = useAppChrome();
  const [initialSessionId] = useState(
    () => initialPosts[0]?.feed_exposure?.feedSessionId ?? crypto.randomUUID()
  );
  const [activeTab, setActiveTab] = useState<HomeFeedTab>(initialTab);
  const [feedCache, setFeedCache] = useState<
    Partial<Record<HomeFeedTab, FeedCacheEntry>>
  >(() => ({
    [initialTab]: {
      posts: initialPosts,
      hasMore: initialHasMore,
      nextCursor: initialNextCursor,
      page: 1,
      feedSessionId: initialSessionId,
      emptyPageCount: initialPosts.length === 0 ? 1 : 0,
      loadedSuccessfully: !initialLoadFailed,
      lastCheckedAt: Date.now(),
    },
  }));
  const [pendingFresh, setPendingFresh] = useState<
    Partial<Record<HomeFeedTab, FreshFeedCandidate>>
  >({});
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Two distinct failure modes: initialError replaces the panel with a
  // full retry state (nothing loaded yet for this tab), while
  // paginationError leaves every already-loaded card in place and only
  // adds a compact inline retry banner at the bottom.
  const [initialError, setInitialError] = useState(initialLoadFailed);
  const [paginationError, setPaginationError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedTopRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const refreshVersionsRef = useRef<Record<HomeFeedTab, number>>({ home: 0, following: 0 });
  const freshCheckVersionsRef = useRef<Record<HomeFeedTab, number>>({ home: 0, following: 0 });
  const freshCheckPendingRef = useRef<Record<HomeFeedTab, boolean>>({ home: false, following: false });
  const refreshPendingRef = useRef(false);
  const paginationPendingRef = useRef(false);
  const inFlightRef = useRef(new Map<string, Promise<FeedResponse>>());
  const activeRequestRef = useRef(0);
  const loadMoreRequestRef = useRef(0);
  const feedCacheRef = useRef(feedCache);
  const scrollPositionsRef = useRef<Record<HomeFeedTab, number>>({ home: 0, following: 0 });
  const pendingScrollRestoreRef = useRef<{ tab: HomeFeedTab; top: number } | null>(null);

  const tabs = visibleHomeFeedTabs(Boolean(currentUserId));
  // A guest has For You alone, and one mode is not presented as a choice.
  const showTabs = tabs.length > 1;

  // Lets the control strip retreat off the top with the nav rather than
  // staying glued there once the nav is gone.
  useStickySubnav(stripRef, feedTopRef);

  useEffect(() => {
    feedCacheRef.current = feedCache;
  }, [feedCache]);

  useEffect(() => {
    const incomingFeedSessionId =
      initialPosts[0]?.feed_exposure?.feedSessionId;
    // Invalidate work from the previous server-rendered snapshot.
    activeRequestRef.current += 1;
    loadMoreRequestRef.current += 1;
    refreshVersionsRef.current.home += 1;
    refreshVersionsRef.current.following += 1;
    freshCheckVersionsRef.current.home += 1;
    freshCheckVersionsRef.current.following += 1;
    freshCheckPendingRef.current.home = false;
    freshCheckPendingRef.current.following = false;
    refreshPendingRef.current = false;
    paginationPendingRef.current = false;
    setActiveTab(initialTab);
    setFeedCache((current) => ({
      ...current,
      [initialTab]: {
        posts: initialPosts,
        hasMore: initialHasMore,
        nextCursor: initialNextCursor,
        page: 1,
        feedSessionId: incomingFeedSessionId ?? initialSessionId,
        emptyPageCount: initialPosts.length === 0 ? 1 : 0,
        loadedSuccessfully: !initialLoadFailed,
        lastCheckedAt: Date.now(),
      },
    }));
    setPendingFresh({});
    scrollPositionsRef.current = { home: 0, following: 0 };
    pendingScrollRestoreRef.current = null;
    setIsSwitching(false);
    setIsLoadingMore(false);
    setInitialError(initialLoadFailed);
    setPaginationError(false);
  }, [
    initialSessionId,
    initialHasMore,
    initialLoadFailed,
    initialNextCursor,
    initialPosts,
    initialTab,
  ]);

  const requestFeedPage = useCallback(
    (
      tab: HomeFeedTab,
      page: number,
      feedSessionId: string,
      nextCursor: string | null = null
    ) => {
      // Both modes continue from a server cursor now. Following's cursor is a
      // chronological keyset; For You's is a signed frozen ranking snapshot.
      const cursor = nextCursor;
      const requestKey = `${feedSessionId}:${tab}:${page}:${cursor ?? "first"}`;
      const existing = inFlightRef.current.get(requestKey);
      if (existing) return existing;

      const request = fetchFeed(
        tab,
        page,
        feedSessionId,
        cursor
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
      tab: HomeFeedTab,
      result: FeedResponse,
      page: number,
      append: boolean,
      feedSessionId: string
    ) => {
      setFeedCache((current) => {
        const previous = current[tab];

        // ID dedupe is now only a retry/corruption defense. A valid For You
        // snapshot never slides underneath pagination, so normal continuation
        // should not repeat a card.
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
            ? page === 1
              ? 1
              : (previous?.emptyPageCount ?? 0) + 1
            : 0;

        return {
          ...current,
          [tab]: {
            posts: append ? [...carried, ...added] : added,
            hasMore: result.hasMore,
            nextCursor: result.nextCursor ?? null,
            page,
            feedSessionId,
            emptyPageCount,
            loadedSuccessfully: true,
            lastCheckedAt: append
              ? (previous?.lastCheckedAt ?? Date.now())
              : Date.now(),
          },
        };
      });
    },
    []
  );

  const reloadFeed = useCallback(
    async (
      tab: HomeFeedTab,
      {
        requestId,
        showError,
      }: {
        requestId: number;
        showError: boolean;
      }
    ) => {
      const version = ++refreshVersionsRef.current[tab];
      freshCheckVersionsRef.current[tab] += 1;
      refreshPendingRef.current = true;
      setIsSwitching(true);
      if (showError) setInitialError(false);
      try {
        // A page-1 reload is a new ranking snapshot and therefore a new feed
        // session for exposure analytics. Infinite-scroll pages keep it.
        const feedSessionId = crypto.randomUUID();
        const result = await requestFeedPage(tab, 1, feedSessionId, null);
        if (refreshVersionsRef.current[tab] === version) {
          writeFeedPage(tab, result, 1, false, feedSessionId);
          setPendingFresh((current) => {
            if (!current[tab]) return current;
            return { ...current, [tab]: undefined };
          });
        }
      } catch {
        if (activeRequestRef.current === requestId && showError) {
          setInitialError(true);
        }
      } finally {
        if (activeRequestRef.current === requestId) {
          refreshPendingRef.current = false;
          setIsSwitching(false);
        }
      }
    },
    [requestFeedPage, writeFeedPage]
  );

  const feedTopTarget = useCallback(() => {
    const anchor = feedTopRef.current;
    if (!anchor || typeof window === "undefined") return 0;
    return Math.max(
      window.scrollY + anchor.getBoundingClientRect().top - navHeight,
      0
    );
  }, [navHeight]);

  // Re-selecting the active mode acts like a native feed tab: first return to
  // the top; once already there, refresh. The explicit "instant" behavior
  // avoids inheriting the site's smooth-scroll CSS for a large upward jump.
  const scrollFeedToTop = useCallback(() => {
    if (typeof window === "undefined") return false;
    revealChrome({ immediate: true });
    const target = feedTopTarget();
    if (window.scrollY <= target + FEED_TOP_TOLERANCE_PX) return false;
    window.scrollTo({ top: target, behavior: "instant" });
    return true;
  }, [feedTopTarget, revealChrome]);

  const checkForFreshContent = useCallback(
    async (tab: HomeFeedTab, entry?: FeedCacheEntry) => {
      const cached = entry ?? feedCacheRef.current[tab];
      if (!cached?.loadedSuccessfully) return;
      if (pendingFresh[tab]) return;
      if (Date.now() - cached.lastCheckedAt < FEED_CACHE_FRESH_MS) return;
      if (freshCheckPendingRef.current[tab]) return;

      freshCheckPendingRef.current[tab] = true;
      const version = ++freshCheckVersionsRef.current[tab];
      const sourceSessionId = cached.feedSessionId;
      const feedSessionId = crypto.randomUUID();

      try {
        const result = await requestFeedPage(tab, 1, feedSessionId, null);
        const latest = feedCacheRef.current[tab];
        if (
          freshCheckVersionsRef.current[tab] !== version ||
          !latest ||
          latest.feedSessionId !== sourceSessionId
        ) {
          return;
        }

        if (containsNewlyPublishedPosts(latest, result.posts)) {
          setPendingFresh((current) => ({
            ...current,
            [tab]: { result, feedSessionId },
          }));
        } else {
          setFeedCache((current) => {
            const currentEntry = current[tab];
            if (!currentEntry || currentEntry.feedSessionId !== sourceSessionId) {
              return current;
            }
            return {
              ...current,
              [tab]: { ...currentEntry, lastCheckedAt: Date.now() },
            };
          });
        }
      } catch {
        // Freshness checks are deliberately fail-soft. The reader already has
        // a valid snapshot, so a background check must never replace it with an
        // error state or interrupt pagination.
      } finally {
        freshCheckPendingRef.current[tab] = false;
      }
    },
    [pendingFresh, requestFeedPage]
  );

  const applyPendingFresh = useCallback(
    (tab: HomeFeedTab) => {
      const candidate = pendingFresh[tab];
      if (!candidate) return false;

      activeRequestRef.current += 1;
      loadMoreRequestRef.current += 1;
      refreshVersionsRef.current[tab] += 1;
      freshCheckVersionsRef.current[tab] += 1;
      refreshPendingRef.current = false;
      paginationPendingRef.current = false;
      setInitialError(false);
      setPaginationError(false);
      setIsLoadingMore(false);
      setIsSwitching(false);
      writeFeedPage(tab, candidate.result, 1, false, candidate.feedSessionId);
      setPendingFresh((current) => ({ ...current, [tab]: undefined }));
      scrollFeedToTop();
      return true;
    },
    [pendingFresh, scrollFeedToTop, writeFeedPage]
  );

  // Restoring a cached mode happens after React has committed that mode's list,
  // so the browser is not asked to scroll against the previous tab's height.
  useEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (!pending || pending.tab !== activeTab || typeof window === "undefined") {
      return;
    }
    pendingScrollRestoreRef.current = null;
    if (Math.abs(window.scrollY - pending.top) <= 1) return;
    window.scrollTo({ top: pending.top, behavior: "instant" });
  }, [activeTab]);

  // When the app regains attention, stale cached tabs get a cheap page-one
  // freshness check. New content is staged behind a dot instead of being
  // inserted under the reader and shifting the current snapshot.
  useEffect(() => {
    const checkActive = () => {
      const entry = feedCacheRef.current[activeTab];
      if (entry) void checkForFreshContent(activeTab, entry);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkActive();
    };

    window.addEventListener("focus", checkActive);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", checkActive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeTab, checkForFreshContent]);

  const selectTab = useCallback(
    (nextTab: HomeFeedTab) => {
      if (typeof window === "undefined") return;

      if (nextTab === activeTab) {
        if (scrollFeedToTop()) return;
        if (applyPendingFresh(nextTab)) return;

        const requestId = activeRequestRef.current + 1;
        activeRequestRef.current = requestId;
        loadMoreRequestRef.current += 1;
        paginationPendingRef.current = false;
        setPaginationError(false);
        setIsLoadingMore(false);
        void reloadFeed(nextTab, { requestId, showError: initialError });
        return;
      }

      scrollPositionsRef.current[activeTab] = window.scrollY;
      const cachedFeed = feedCache[nextTab];
      const hasCachedFeed = Boolean(cachedFeed?.loadedSuccessfully);
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;

      // Invalidate pagination owned by the previous tab. Its late result must
      // never append into the newly active surface.
      loadMoreRequestRef.current += 1;
      paginationPendingRef.current = false;
      refreshPendingRef.current = false;

      setActiveTab(nextTab);
      setInitialError(false);
      setPaginationError(false);
      setIsLoadingMore(false);
      setIsSwitching(!hasCachedFeed);
      window.history.replaceState(null, "", buildFeedUrl(nextTab));

      if (hasCachedFeed && cachedFeed) {
        pendingScrollRestoreRef.current = {
          tab: nextTab,
          top: scrollPositionsRef.current[nextTab] ?? 0,
        };
        if (!pendingFresh[nextTab]) {
          void checkForFreshContent(nextTab, cachedFeed);
        }
        return;
      }

      scrollFeedToTop();
      void reloadFeed(nextTab, { requestId, showError: true });
    },
    [
      activeTab,
      applyPendingFresh,
      checkForFreshContent,
      feedCache,
      pendingFresh,
      initialError,
      reloadFeed,
      scrollFeedToTop,
    ]
  );

  const retryInitial = useCallback(() => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    void reloadFeed(activeTab, {
      requestId,
      showError: true,
    });
  }, [activeTab, reloadFeed]);

  const loadMore = useCallback(async () => {
    const currentFeed = feedCache[activeTab];
    if (
      refreshPendingRef.current || paginationPendingRef.current ||
      isSwitching || isLoadingMore || !currentFeed?.hasMore
    ) return;
    // The sentinel is 400px tall in effect and re-arms on every cache write, so
    // a `hasMore` that never turns false would page forever. Three pages that
    // added nothing is the same signal the end-state card reads.
    if (currentFeed.emptyPageCount >= 3) return;

    const tab = activeTab;
    const requestId = loadMoreRequestRef.current + 1;
    loadMoreRequestRef.current = requestId;
    paginationPendingRef.current = true;
    const refreshVersion = refreshVersionsRef.current[tab];
    setIsLoadingMore(true);
    setPaginationError(false);
    try {
      const nextPage = currentFeed.page + 1;
      const result = await requestFeedPage(
        tab,
        nextPage,
        currentFeed.feedSessionId,
        currentFeed.nextCursor ?? null
      );
      if (
        loadMoreRequestRef.current === requestId &&
        refreshVersionsRef.current[tab] === refreshVersion
      ) {
        writeFeedPage(tab, result, nextPage, true, currentFeed.feedSessionId);
      }
    } catch (error) {
      if (loadMoreRequestRef.current === requestId) {
        if (
          error instanceof FeedRequestError &&
          error.code === "INVALID_CURSOR"
        ) {
          if (tab === "home") {
            // A ranked continuation cannot safely fall back to page-number
            // offsets: doing that is the exact moving-window bug v4 removes.
            // Start a fresh snapshot instead.
            const freshRequestId = activeRequestRef.current + 1;
            activeRequestRef.current = freshRequestId;
            void reloadFeed("home", {
              requestId: freshRequestId,
              showError: true,
            });
            setPaginationError(false);
            return;
          } else {
            // Following can still retry the same page without its stale
            // keyset cursor because chronological ordering is authoritative.
            setFeedCache((current) => {
              const entry = current[tab];
              if (!entry) return current;
              return { ...current, [tab]: { ...entry, nextCursor: null } };
            });
          }
        }
        setPaginationError(true);
      }
    } finally {
      if (loadMoreRequestRef.current === requestId) {
        paginationPendingRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [
    activeTab,
    feedCache,
    isLoadingMore,
    isSwitching,
    requestFeedPage,
    reloadFeed,
    writeFeedPage,
  ]);

  useEffect(() => {
    const currentFeed = feedCache[activeTab];
    if (
      !sentinelRef.current || !currentFeed?.hasMore || isSwitching ||
      isLoadingMore || initialError || paginationError
    ) return;
    if (typeof IntersectionObserver === "undefined") return;
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
  }, [activeTab, feedCache, isSwitching, isLoadingMore, initialError, paginationError, loadMore]);

  const currentFeed = feedCache[activeTab];
  const posts = currentFeed?.posts ?? EMPTY_POSTS;
  const hasMore = currentFeed?.hasMore ?? false;
  const emptyPageCount = currentFeed?.emptyPageCount ?? 0;
  const showSkeleton = isSwitching && posts.length === 0;
  const showEmpty = !initialError && !showSkeleton && posts.length === 0;
  const showFeedList = !initialError && !showSkeleton && posts.length > 0;
  const showEndState =
    posts.length > 0 &&
    !initialError &&
    !showSkeleton &&
    !isSwitching &&
    !isLoadingMore &&
    !pendingFresh[activeTab] &&
    (!hasMore || emptyPageCount >= 3);

  /**
   * Arrow-key navigation for the tablist, paired with the roving `tabIndex`
   * below, which takes the inactive tab out of the Tab sequence so the whole
   * row is one stop. Activation follows focus, matching what a click does.
   */
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab || nextTab === activeTab) return;
    document.getElementById(`feed-tab-${nextTab}`)?.focus();
    selectTab(nextTab);
  };

  return (
    <div>
      {!currentUserId ? <HomeGuestNotice /> : null}

      {/* Honest (non-sticky) marker for where the feed controls sit in the
          document -- the sticky wrapper's own rect lies once it is pinned. */}
      <div ref={feedTopRef} aria-hidden="true" />

      {/* The two Home modes are a balanced feed switcher, not a generic
          horizontally scrolling tab list. On mobile the control breaks out of
          the 16px reading gutter so it belongs to app chrome; publication rows
          keep the reading gutter below it. */}
      {showTabs ? (
        <>
          <span className="sr-only" aria-live="polite">
            {pendingFresh[activeTab]
              ? `New posts available in ${HOME_FEED_TAB_LABELS[activeTab]}.`
              : ""}
          </span>
          <div
            ref={stripRef}
            data-app-context-nav=""
            data-app-chrome-motion=""
            className="pointer-events-none z-30 -mx-4 mb-0 w-[calc(100%+2rem)] md:mx-0 md:w-full"
          >
            <div
              data-app-context-primary=""
              className="pointer-events-auto grid grid-cols-2 border-b border-divider bg-canvas"
              role="tablist"
              aria-label="Choose feed"
              onKeyDown={handleTabKeyDown}
            >
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`feed-tab-${tab}`}
                  aria-controls="home-feed-panel"
                  aria-selected={activeTab === tab}
                  tabIndex={activeTab === tab ? 0 : -1}
                  onClick={() => selectTab(tab)}
                  className={`relative flex min-h-12 w-full items-center justify-center px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
                    activeTab === tab
                      ? "text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <span className="relative inline-flex items-center">
                    {HOME_FEED_TAB_LABELS[tab]}
                    {pendingFresh[tab] ? (
                      <span
                        data-feed-new-indicator=""
                        aria-hidden="true"
                        className="absolute -right-2.5 top-0 h-1.5 w-1.5 rounded-full bg-emerald-ink"
                      />
                    ) : null}
                  </span>
                  {activeTab === tab ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-px left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-emerald-brand"
                    />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div
        id="home-feed-panel"
        {...(showTabs
          ? { role: "tabpanel", "aria-labelledby": `feed-tab-${activeTab}` }
          : { "aria-label": "Publications" })}
        aria-busy={isSwitching || isLoadingMore}
      >
        {initialError ? (
          <FeedErrorState onRetry={retryInitial} />
        ) : showSkeleton ? (
          <FeedSkeleton />
        ) : showEmpty ? (
          <HomeFeedEmptyState tab={activeTab} />
        ) : showFeedList ? (
          <PostFeed
            posts={posts}
            surface={activeTab}
            currentUserId={currentUserId}
          />
        ) : null}
      </div>

      {/* The same skeleton the first load uses, rather than a line of grey
          text. It holds the height the incoming cards will occupy, so the
          scroll position stays put when they land. */}
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

      {hasMore && emptyPageCount < 3 && !initialError && !paginationError ? (
        <div className="flex justify-center py-4">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isSwitching || isLoadingMore}
            className="min-h-11 rounded-lg px-4 text-sm font-semibold text-emerald-ink hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50"
          >
            Load more
          </button>
        </div>
      ) : null}
      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
