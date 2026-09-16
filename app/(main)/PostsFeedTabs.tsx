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
  const [activeTab, setActiveTab] = useState<HomeFeedTab>(initialTab);
  const [feedCache, setFeedCache] = useState<
    Partial<Record<HomeFeedTab, FeedCacheEntry>>
  >(() => ({
    [initialTab]: {
      posts: initialPosts,
      hasMore: initialHasMore,
      nextCursor: initialNextCursor,
      page: 1,
      emptyPageCount: initialPosts.length === 0 ? 1 : 0,
    },
  }));
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Two distinct failure modes: initialError replaces the panel with a
  // full retry state (nothing loaded yet for this tab), while
  // paginationError leaves every already-loaded card in place and only
  // adds a compact inline retry banner at the bottom.
  const [initialError, setInitialError] = useState(initialLoadFailed);
  const [paginationError, setPaginationError] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedTopRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const feedSessionIdRef = useRef(
    initialPosts[0]?.feed_exposure?.feedSessionId ?? crypto.randomUUID()
  );
  const inFlightRef = useRef(new Map<string, Promise<FeedResponse>>());
  const activeRequestRef = useRef(0);
  const loadMoreRequestRef = useRef(0);

  const tabs = visibleHomeFeedTabs(Boolean(currentUserId));
  // A guest has For You alone, and one mode is not presented as a choice.
  const showTabs = tabs.length > 1;

  // Lets the control strip retreat off the top with the nav rather than
  // staying glued there once the nav is gone.
  useStickySubnav(stripRef, feedTopRef);

  useEffect(() => {
    const incomingFeedSessionId =
      initialPosts[0]?.feed_exposure?.feedSessionId;
    if (incomingFeedSessionId) {
      feedSessionIdRef.current = incomingFeedSessionId;
    }
    setActiveTab(initialTab);
    setFeedCache((current) => ({
      ...current,
      [initialTab]: {
        posts: initialPosts,
        hasMore: initialHasMore,
        nextCursor: initialNextCursor,
        page: 1,
        emptyPageCount: initialPosts.length === 0 ? 1 : 0,
      },
    }));
    setIsSwitching(false);
    setIsLoadingMore(false);
    setInitialError(initialLoadFailed);
    setPaginationError(false);
  }, [
    initialHasMore,
    initialLoadFailed,
    initialNextCursor,
    initialPosts,
    initialTab,
  ]);

  const requestFeedPage = useCallback(
    (tab: HomeFeedTab, page: number, nextCursor: string | null = null) => {
      // For You pages its fixed ranked window by number. Following continues
      // from the server's keyset cursor.
      const cursor = tab === "home" ? null : nextCursor;
      const requestKey = `${tab}:${page}:${cursor ?? "offset"}`;
      const existing = inFlightRef.current.get(requestKey);
      if (existing) return existing;

      const request = fetchFeed(
        tab,
        page,
        feedSessionIdRef.current,
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
    (tab: HomeFeedTab, result: FeedResponse, page: number, append: boolean) => {
      setFeedCache((current) => {
        const previous = current[tab];

        // ID dedupe is a final defense for retries, and for a post published
        // between two requests sliding a page window.
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
            emptyPageCount,
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
        showSkeleton,
      }: {
        requestId: number;
        showError: boolean;
        showSkeleton: boolean;
      }
    ) => {
      if (showSkeleton) setIsSwitching(true);
      if (showError) setInitialError(false);
      try {
        const result = await requestFeedPage(tab, 1, null);
        writeFeedPage(tab, result, 1, false);
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
  // meaningful for the old one. Snap back to the top of the feed, but only when
  // the reader is already below it, so switching from the top of the page never
  // yanks the viewport.
  const scrollFeedToTop = useCallback(() => {
    const anchor = feedTopRef.current;
    if (!anchor || typeof window === "undefined") return;

    // The measured height, not the live offset. This scroll always moves
    // upward, and an upward scroll is exactly what brings the nav back -- so by
    // the time the tab's new cards are on screen there is a full nav bar at the
    // top again, and the marker has to land below it.
    revealChrome({ immediate: true });
    const target = Math.max(
      window.scrollY + anchor.getBoundingClientRect().top - navHeight,
      0
    );
    if (window.scrollY <= target) return;
    // "instant", not "auto". Per CSSOM View, "auto" defers to the computed
    // scroll-behavior, and globals.css sets `html { scroll-behavior: smooth }`
    // for everyone who has not asked for reduced motion, so "auto" animated
    // the reader back up past every card they were trying to leave.
    window.scrollTo({ top: target, behavior: "instant" });
  }, [navHeight, revealChrome]);

  const selectTab = useCallback(
    (nextTab: HomeFeedTab) => {
      const hasCachedFeed = Boolean(feedCache[nextTab]);
      const requestId = activeRequestRef.current + 1;
      activeRequestRef.current = requestId;
      // Invalidate any pagination request owned by the previous tab. Its
      // result may still warm that tab's cache, but it cannot change the
      // loading or error state for the newly active one.
      loadMoreRequestRef.current += 1;

      setActiveTab(nextTab);
      setInitialError(false);
      setPaginationError(false);
      setIsLoadingMore(false);
      setIsSwitching(!hasCachedFeed);
      scrollFeedToTop();
      window.history.replaceState(null, "", buildFeedUrl(nextTab));
      void reloadFeed(nextTab, {
        requestId,
        showError: !hasCachedFeed,
        showSkeleton: !hasCachedFeed,
      });
    },
    [feedCache, reloadFeed, scrollFeedToTop]
  );

  const retryInitial = useCallback(() => {
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    void reloadFeed(activeTab, {
      requestId,
      showError: true,
      showSkeleton: true,
    });
  }, [activeTab, reloadFeed]);

  const loadMore = useCallback(async () => {
    const currentFeed = feedCache[activeTab];
    if (isSwitching || isLoadingMore || !currentFeed?.hasMore) return;
    // The sentinel is 400px tall in effect and re-arms on every cache write, so
    // a `hasMore` that never turns false would page forever. Three pages that
    // added nothing is the same signal the end-state card reads.
    if (currentFeed.emptyPageCount >= 3) return;

    const tab = activeTab;
    const requestId = loadMoreRequestRef.current + 1;
    loadMoreRequestRef.current = requestId;
    setIsLoadingMore(true);
    setPaginationError(false);
    try {
      const nextPage = currentFeed.page + 1;
      const result = await requestFeedPage(
        tab,
        nextPage,
        currentFeed.nextCursor ?? null
      );
      writeFeedPage(tab, result, nextPage, true);
    } catch (error) {
      if (loadMoreRequestRef.current === requestId) {
        if (
          error instanceof FeedRequestError &&
          error.code === "INVALID_CURSOR"
        ) {
          // Cursors are intentionally version/context-bound. After a deploy,
          // clear the rejected cursor so Retry can fall back to the same page
          // number instead of repeating a permanent 400.
          setFeedCache((current) => {
            const entry = current[tab];
            if (!entry) return current;
            return { ...current, [tab]: { ...entry, nextCursor: null } };
          });
        }
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
    writeFeedPage,
  ]);

  useEffect(() => {
    const currentFeed = feedCache[activeTab];
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
  }, [activeTab, feedCache, isSwitching, loadMore]);

  // Track whether the tab strip is currently pinned, so its shadow only
  // appears while cards are actually passing beneath it -- a permanent shadow
  // reads as a bar floating over nothing when the page is at rest.
  //
  // feedTopRef is the non-sticky marker just above the strip, so it leaves the
  // viewport at exactly the moment the strip pins. Watching it costs one
  // IntersectionObserver instead of a layout read on every scroll event.
  useEffect(() => {
    const anchor = feedTopRef.current;
    if (!anchor || typeof IntersectionObserver === "undefined") return;

    // Deliberately the measured height, frozen at mount, rather than the live
    // --app-nav-offset: this gates the strip's shadow, not its position, and
    // rebuilding the observer on every hide/reveal would flicker it.
    const measuredNavHeight =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-nav-height")
      ) || 0;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setIsPinned(!entry.isIntersecting);
      },
      { rootMargin: `-${measuredNavHeight}px 0px 0px 0px`, threshold: 0 }
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  const currentFeed = feedCache[activeTab];
  const posts = currentFeed?.posts ?? EMPTY_POSTS;
  const hasMore = currentFeed?.hasMore ?? false;
  const emptyPageCount = currentFeed?.emptyPageCount ?? 0;
  const showSkeleton = isSwitching && !currentFeed;
  const showEmpty = !initialError && !showSkeleton && posts.length === 0;
  const showFeedList = !initialError && !showSkeleton && posts.length > 0;
  const showEndState =
    posts.length > 0 &&
    !initialError &&
    !showSkeleton &&
    !isLoadingMore &&
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

      {/* Pinned beneath the nav while the nav is there, and at the very top of
          the viewport once it isn't. The sticky offset comes from the shared
          [data-app-context-nav] rule, which tracks the nav's live occupancy.

          The wrapper paints nothing and swallows no taps; the tab row carries
          its own full-bleed background and padding, so cards passing beneath
          have no transparent gutter to ghost through. The bottom border is
          always in the box, so gaining the shadow once pinned costs no reflow. */}
      {showTabs ? (
        <div
          ref={stripRef}
          data-app-context-nav=""
          data-app-chrome-motion=""
          className="pointer-events-none z-30 -mx-4 mb-3 w-[calc(100%+2rem)] sm:mx-0 sm:w-full"
        >
          <div
            data-app-context-primary=""
            className={`pointer-events-auto flex gap-1 overflow-x-auto overscroll-x-contain border-b border-divider bg-card px-4 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden ${
              isPinned ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]" : ""
            }`}
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
                // Underline only. Tabs are navigation, not an action, so they
                // should be the quietest thing on the page.
                className={`-mb-px min-h-11 shrink-0 border-b-2 px-3.5 py-2 text-byline font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:px-4 ${
                  activeTab === tab
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {HOME_FEED_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        id="home-feed-panel"
        {...(showTabs
          ? { role: "tabpanel", "aria-labelledby": `feed-tab-${activeTab}` }
          : { "aria-label": "Publications" })}
        aria-busy={showSkeleton || isLoadingMore}
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

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
