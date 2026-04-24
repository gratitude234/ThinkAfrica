"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PostFeed from "@/components/post/PostFeed";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { PostCardData } from "@/components/post/PostCard";
import type { FeedTimeframe } from "@/lib/feedData";
import FeedFilterChips from "./FeedFilterChips";

type TabKey = "home" | "following" | "latest";
type TypeFilter = "all" | "research" | "essay" | "policy_brief" | "blog";

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
) {
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

  return (await response.json()) as {
    posts: PostCardData[];
    hasMore: boolean;
  };
}

function EndStateCard({ topics }: { topics: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
      <p className="text-base font-semibold text-gray-900">
        You&apos;re all caught up.
      </p>
      <p className="mt-1 text-sm text-gray-500">
        Explore what&apos;s happening in other topics.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {topics.map((topic) => (
          <a
            key={topic}
            href={`/topics/${encodeURIComponent(topic)}`}
            className="rounded-full border border-gray-200 bg-canvas px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:text-ink"
          >
            + {topic}
          </a>
        ))}
      </div>
      <a
        href="/?tab=latest"
        className="mt-3 inline-block text-sm font-medium text-ink hover:underline"
      >
        Or switch to Latest →
      </a>
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

export default function PostsFeedTabs({
  initialTab,
  initialType,
  initialTimeframe,
  initialPosts,
  initialHasMore,
  showFollowingTab,
  activeDebate,
  peopleSuggestions,
  currentUserId,
  sectionLabel = "Latest",
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
  currentUserId: string | null;
  sectionLabel?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
  const [timeframe, setTimeframe] = useState<FeedTimeframe>(initialTimeframe);
  const [posts, setPosts] = useState<PostCardData[]>(initialPosts);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyPageCount, setEmptyPageCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
    setTypeFilter(initialType);
    setTimeframe(initialTimeframe);
    setPosts(initialPosts);
    setPage(1);
    setHasMore(initialHasMore);
    setError(null);
    setEmptyPageCount(0);
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

  const reloadFeed = useCallback(
    async (
      nextTab: TabKey,
      nextType: TypeFilter,
      nextTimeframe: FeedTimeframe
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFeed(nextTab, nextType, nextTimeframe, 1);
        setPosts(result.posts);
        setHasMore(result.hasMore);
        setPage(1);
        setEmptyPageCount(result.posts.length === 0 ? 1 : 0);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error ? fetchError.message : "Failed to load feed"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateState = useCallback(
    (nextTab: TabKey, nextType: TypeFilter, nextTimeframe: FeedTimeframe) => {
      setActiveTab(nextTab);
      setTypeFilter(nextType);
      setTimeframe(nextTimeframe);
      syncUrl(nextTab, nextType, nextTimeframe);
      void reloadFeed(nextTab, nextType, nextTimeframe);
    },
    [reloadFeed, syncUrl]
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const nextPage = page + 1;
      const result = await fetchFeed(activeTab, typeFilter, timeframe, nextPage);
      setPosts((current) => [...current, ...result.posts]);
      setHasMore(result.hasMore);
      setPage(nextPage);
      setEmptyPageCount((current) =>
        result.posts.length === 0 ? current + 1 : 0
      );
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load feed"
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab, hasMore, loading, page, timeframe, typeFilter]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

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
  }, [hasMore, loadMore]);

  const suggestedTopics = useMemo(() => deriveSuggestedTopics(posts), [posts]);
  const showEndState = !hasMore || emptyPageCount >= 3;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-t border-gray-100 pt-6">
        <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
          {sectionLabel}
        </span>
        {showFollowingTab ? (
          <div className="flex gap-3 text-sm">
            {(["home", "following", "latest"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => updateState(tab, typeFilter, timeframe)}
                className={`capitalize transition-colors ${
                  activeTab === tab
                    ? "font-medium text-ink"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        ) : null}
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

      <PostFeed
        posts={posts}
        activeTab={activeTab}
        activeDebate={activeDebate}
        peopleSuggestions={peopleSuggestions}
        currentUserId={currentUserId}
      />

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-400">Loading more…</div>
      ) : null}

      {!loading && showEndState && posts.length > 0 ? (
        <div className="mt-6">
          <EndStateCard topics={suggestedTopics} />
        </div>
      ) : null}

      <div ref={sentinelRef} className="h-1" />
    </div>
  );
}
