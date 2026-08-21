"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import PostCardImpression from "@/components/post/PostCardImpression";
import type { PostCardData } from "@/components/post/PostCard";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  filterPostsByExplore,
  getGenreFilterLabel,
  getPrimaryFilterLabel,
  isGenreRefinementActive,
  type ExploreGenreFilter,
  type ExplorePrimaryFilter,
} from "./exploreFilters";

type ExploreFeedTab = "for-you" | "trending";

interface FeedResponse {
  posts: PostCardData[];
  hasMore: boolean;
  nextCursor?: string | null;
}

interface ExploreFeedProps {
  tab: ExploreFeedTab;
  initialPosts: PostCardData[];
  initialHasMore: boolean;
  initialNextCursor: string | null;
  primary: ExplorePrimaryFilter;
  genre: ExploreGenreFilter;
  signedIn: boolean;
  surface: string;
  /** Rendered after the third card, once the reading run has begun. */
  interlude?: ReactNode;
}

const PAGE_SIZE = 12;

function buildFeedUrl(
  tab: ExploreFeedTab,
  primary: ExplorePrimaryFilter,
  page: number,
  cursor: string | null
) {
  const params = new URLSearchParams();
  params.set("tab", "home");
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));
  if (primary !== "all") params.set("type", primary);
  if (tab === "trending") {
    params.set("timeframe", "week");
    // Matches the anonymous ranking the server rendered page 1 with.
    params.set("personalized", "0");
  }
  if (cursor) params.set("cursor", cursor);
  return `/api/feed?${params.toString()}`;
}

export default function ExploreFeed({
  tab,
  initialPosts,
  initialHasMore,
  initialNextCursor,
  primary,
  genre,
  signedIn,
  surface,
  interlude,
}: ExploreFeedProps) {
  const [posts, setPosts] = useState<PostCardData[]>(initialPosts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState<string | null>(initialNextCursor);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    const nextPage = page + 1;

    try {
      const response = await fetch(buildFeedUrl(tab, primary, nextPage, cursor), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Feed request failed");
      const data = (await response.json()) as FeedResponse;

      // The ranked window can overlap between pages, so identity is enforced
      // here rather than trusting the server never to repeat a card.
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...data.posts.filter((post) => !seen.has(post.id))];
      });
      setHasMore(data.hasMore);
      setCursor(data.nextCursor ?? null);
      setPage(nextPage);
      trackActivationEvent({
        event: "discover_item_clicked",
        metadata: {
          item: "load_more",
          tab,
          page: nextPage,
          returned: data.posts.length,
          surface,
        },
      });
      if (!data.hasMore) {
        trackActivationEvent({
          event: "discover_item_clicked",
          metadata: { item: "feed_exhausted", tab, page: nextPage, surface },
        });
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, hasMore, loading, page, primary, surface, tab]);

  // The primary filter is applied by the query. Only the Article genre refines
  // in memory, so it is the only axis that can empty an otherwise full page.
  const visible = filterPostsByExplore(posts, primary, genre);
  const genreRefining = isGenreRefinementActive(primary, genre);

  if (visible.length === 0) {
    return (
      <ExploreFeedEmptyState
        primary={primary}
        genre={genre}
        signedIn={signedIn}
        genreRefining={genreRefining}
        loadedCount={posts.length}
        hasMore={hasMore}
        loading={loading}
        onLoadMore={loadMore}
      />
    );
  }

  // After the third card once there are that many, otherwise after the last
  // one. Anchoring it to index 2 alone meant a shelf of one or two posts
  // dropped the topic strip entirely, which is exactly the feed that most
  // needs somewhere else to go.
  const interludeIndex = Math.min(2, visible.length - 1);

  return (
    <div>
      {visible.map((post, index) => (
        <div key={post.id}>
          <PostCardImpression post={post} surface={surface} variant="explore" />
          {interlude && index === interludeIndex ? interlude : null}
        </div>
      ))}

      {genreRefining && hasMore ? (
        <p className="px-1 pb-3 pt-1 text-meta text-ink-muted">
          Showing {visible.length} {getGenreFilterLabel(genre).toLowerCase()}{" "}
          {visible.length === 1 ? "match" : "matches"} in the {posts.length}{" "}
          Articles loaded so far.
        </p>
      ) : null}

      <ExploreFeedFooter
        hasMore={hasMore}
        loading={loading}
        failed={failed}
        onLoadMore={loadMore}
      />
    </div>
  );
}

const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";
const PRIMARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:opacity-60";

function ExploreFeedFooter({
  hasMore,
  loading,
  failed,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoadMore: () => void;
}) {
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <p className="text-byline font-medium text-ink">
          Those posts didn&apos;t load.
        </p>
        <button type="button" onClick={onLoadMore} className={SECONDARY_ACTION_CLASS}>
          Try again
        </button>
      </div>
    );
  }

  if (!hasMore) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <span aria-hidden="true" className="mb-1 h-px w-8 bg-divider" />
        <p className="text-byline font-medium text-ink-muted">
          You&apos;ve reached the end of this view.
        </p>
        <p className="text-meta text-ink-muted">
          Try another filter, or browse the full topic directory.
        </p>
        <Link href="/topics" className={`mt-2 ${SECONDARY_ACTION_CLASS}`}>
          Browse topics
        </Link>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-6">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        aria-busy={loading}
        className={`${SECONDARY_ACTION_CLASS} px-5 disabled:opacity-60`}
      >
        {loading ? "Loading..." : "Load more"}
      </button>
    </div>
  );
}

/**
 * Empty states name the filter that produced them. The page used to answer
 * every empty result with "No recommendations yet. Follow topics and writers
 * to tune your Explore page.", which described a cold personalization profile
 * even when the real cause was a content-type filter with nothing behind it.
 */
function ExploreFeedEmptyState({
  primary,
  genre,
  signedIn,
  genreRefining,
  loadedCount,
  hasMore,
  loading,
  onLoadMore,
}: {
  primary: ExplorePrimaryFilter;
  genre: ExploreGenreFilter;
  signedIn: boolean;
  genreRefining: boolean;
  loadedCount: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const filtered = primary !== "all";
  const genreLabel = getGenreFilterLabel(genre);
  const primaryLabel = getPrimaryFilterLabel(primary);

  let heading: string;
  let detail: string;

  if (genreRefining) {
    heading = `No ${genreLabel} articles in this batch.`;
    detail = hasMore
      ? `${loadedCount} Articles are loaded so far. Genre is descriptive metadata, so it narrows what is already here rather than the search itself.`
      : `None of the ${loadedCount} published Articles carry the ${genreLabel} genre yet.`;
  } else if (filtered) {
    heading = `No ${primaryLabel} published yet.`;
    detail = "Nothing matches this content type right now. Try another filter.";
  } else if (signedIn) {
    heading = "Nothing to show here yet.";
    detail = "Follow topics and writers to sharpen what Explore surfaces.";
  } else {
    heading = "Nothing to show here yet.";
    detail = "Sign in to get recommendations shaped by what you read.";
  }

  return (
    <div className="rounded-xl border border-dashed border-card-border bg-card px-6 py-10 text-center">
      <p className="text-byline font-medium text-ink">{heading}</p>
      <p className="mx-auto mt-1.5 max-w-md text-meta text-ink-muted">{detail}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {genreRefining && hasMore ? (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            className={PRIMARY_ACTION_CLASS}
          >
            {loading ? "Loading..." : "Load more Articles"}
          </button>
        ) : null}
        {filtered ? (
          <Link href="/explore" className={SECONDARY_ACTION_CLASS}>
            Clear filters
          </Link>
        ) : (
          <Link href="/topics" className={SECONDARY_ACTION_CLASS}>
            Browse topics
          </Link>
        )}
        {!signedIn ? (
          <Link href="/login?redirectTo=/explore" className={PRIMARY_ACTION_CLASS}>
            Sign in
          </Link>
        ) : null}
      </div>
    </div>
  );
}
