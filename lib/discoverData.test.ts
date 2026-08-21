import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PostCardData } from "@/components/post/PostCard";

const fetchFeedPage = vi.fn();
const fetchCitableFeed = vi.fn();

vi.mock("@/lib/feedData", () => ({
  fetchFeedPage: (options: unknown) => fetchFeedPage(options),
  fetchCitableFeed: (...args: unknown[]) => fetchCitableFeed(...args),
}));

vi.mock("@/lib/suggestedPeople", () => ({
  getSuggestedPeople: vi.fn(async () => ({ suggestions: [], reason: "Top contributors" })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createSupabase(),
}));

vi.mock("@/lib/featureFlags", () => ({
  isAuthorSubscriptionsUxV2Enabled: () => false,
  isTopicSubscriptionsEnabled: () => false,
}));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { getDiscoverData } from "./discoverData";

function post(id: string, overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id,
    slug: `slug-${id}`,
    title: `Post ${id}`,
    excerpt: null,
    type: "blog",
    content_kind: "post",
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    profiles: null,
    ...overrides,
  } as unknown as PostCardData;
}

function createSupabase() {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    not: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: [], count: 0 }),
    single: () => Promise.resolve({ data: null }),
  };
  return { from: () => builder };
}

function feedResult(posts: PostCardData[], hasMore = true, nextCursor = "cursor-1") {
  return { posts, hasMore, nextCursor };
}

beforeEach(() => {
  fetchFeedPage.mockReset();
  fetchCitableFeed.mockReset();
  fetchFeedPage.mockResolvedValue(feedResult([post("a")]));
  fetchCitableFeed.mockResolvedValue([]);
});

describe("Explore filters reach the query", () => {
  it("pushes the active content filter down to fetchFeedPage", async () => {
    await getDiscoverData(createSupabase(), null, {
      primary: "research",
      genre: "all",
    });

    // The regression this guards: `type` was hardcoded to null here while the
    // page filtered the returned page in memory, so selecting Research
    // searched only whatever the unfiltered ranking happened to return and
    // reported "no recommendations" when none of them matched.
    expect(fetchFeedPage).toHaveBeenCalled();
    for (const [options] of fetchFeedPage.mock.calls) {
      expect((options as { type: unknown }).type).toBe("research");
    }
  });

  it("sends null rather than the string 'all' when no filter is active", async () => {
    await getDiscoverData(createSupabase(), null, { primary: "all", genre: "all" });

    for (const [options] of fetchFeedPage.mock.calls) {
      expect((options as { type: unknown }).type).toBeNull();
    }
  });

  it("defaults to an unfiltered query when no filters are supplied", async () => {
    await getDiscoverData(createSupabase(), null);

    for (const [options] of fetchFeedPage.mock.calls) {
      expect((options as { type: unknown }).type).toBeNull();
    }
  });

  it("applies the filter to both the For you and Trending shelves", async () => {
    await getDiscoverData(createSupabase(), null, { primary: "article", genre: "essay" });

    const timeframes = fetchFeedPage.mock.calls.map(
      ([options]) => (options as { timeframe: string }).timeframe
    );
    expect(timeframes).toContain("all");
    expect(timeframes).toContain("week");
    for (const [options] of fetchFeedPage.mock.calls) {
      expect((options as { type: unknown }).type).toBe("article");
    }
  });
});

describe("Explore shelves are paginatable", () => {
  it("requests a full page rather than a six-post shelf", async () => {
    await getDiscoverData(createSupabase(), null);

    for (const [options] of fetchFeedPage.mock.calls) {
      expect((options as { pageSize: number }).pageSize).toBeGreaterThanOrEqual(12);
    }
  });

  it("surfaces hasMore and nextCursor so the client can continue the query", async () => {
    fetchFeedPage.mockResolvedValue(feedResult([post("a"), post("b")], true, "cursor-abc"));

    const data = await getDiscoverData(createSupabase(), null);

    expect(data.forYou.hasMore).toBe(true);
    expect(data.forYou.nextCursor).toBe("cursor-abc");
    expect(data.trending.hasMore).toBe(true);
    expect(data.trending.nextCursor).toBe("cursor-abc");
  });

  it("normalizes a missing cursor to null rather than undefined", async () => {
    fetchFeedPage.mockResolvedValue({ posts: [post("a")], hasMore: false });

    const data = await getDiscoverData(createSupabase(), null);

    expect(data.forYou.hasMore).toBe(false);
    expect(data.forYou.nextCursor).toBeNull();
  });
});

describe("Trending stays depersonalized", () => {
  it("renders the weekly shelf with no viewer signals", async () => {
    await getDiscoverData(createSupabase(), "viewer-1");

    const trending = fetchFeedPage.mock.calls
      .map(([options]) => options as Record<string, unknown>)
      .find((options) => options.timeframe === "week");

    expect(trending?.userId).toBeNull();
    expect(trending?.followedIds).toEqual([]);
    expect(trending?.userInterests).toEqual([]);
  });
});
