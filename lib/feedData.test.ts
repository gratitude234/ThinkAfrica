import { describe, expect, it, vi } from "vitest";
import {
  RANKED_FEED_WINDOW,
  applyPostFilters,
  fetchFeedPage,
  fetchResponsePage,
  normalizeFeedContentFilter,
} from "./feedData";
import { makeBuilder, makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

function makeQuerySpy() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: Record<string, unknown> = {};
  for (const method of ["eq", "gte", "not"]) {
    query[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    });
  }
  return { query, calls };
}

describe("normalizeFeedContentFilter", () => {
  it.each([
    ["post", "post"],
    ["blog", "post"],
    ["article", "article"],
    ["essay", "article"],
    ["policy_brief", "article"],
    ["research", "research"],
    ["unknown", "all"],
    [null, "all"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeFeedContentFilter(input)).toBe(expected);
  });
});

describe("applyPostFilters", () => {
  it("filters Articles by resolved content_kind", () => {
    const { query, calls } = makeQuerySpy();

    applyPostFilters(query, { type: "article", cutoff: null });

    expect(calls).toContainEqual({ method: "eq", args: ["content_kind", "article"] });
  });

  it("filters Research and Posts by resolved content_kind", () => {
    const { query: researchQuery, calls: researchCalls } = makeQuerySpy();
    applyPostFilters(researchQuery, { type: "research", cutoff: null });
    expect(researchCalls).toContainEqual({ method: "eq", args: ["content_kind", "research"] });

    const { query: postQuery, calls: postCalls } = makeQuerySpy();
    applyPostFilters(postQuery, { type: "post", cutoff: null });
    expect(postCalls).toContainEqual({ method: "eq", args: ["content_kind", "post"] });
  });

  it("applies no type filter for 'all' or null", () => {
    for (const type of ["all", null] as const) {
      const { query, calls } = makeQuerySpy();

      applyPostFilters(query, { type, cutoff: null });

      expect(calls.filter((c) => c.method === "eq" && c.args[0] !== "status")).toHaveLength(0);
    }
  });
});

describe("fetchResponsePage", () => {
  function supabaseReturning(rowCount: number) {
    return makeFakeSupabase({
      posts: queueResults({
        data: Array.from({ length: rowCount }, (_, index) => ({
          id: `response-${index}`,
          author_id: "author-1",
          tags: [],
        })),
        error: null,
      }),
    });
  }

  it("reports more available by over-fetching one row, and does not return it", async () => {
    const supabase = supabaseReturning(11);

    const page = await fetchResponsePage(supabase as never, "post-1", null, 10);

    // The extra row is what makes hasMore a fact rather than a guess.
    expect(supabase.builders.posts[0].limit).toHaveBeenCalledWith(11);
    expect(page.cards).toHaveLength(10);
    expect(page.hasMore).toBe(true);
  });

  it("reports no more when the page is not full", async () => {
    const page = await fetchResponsePage(supabaseReturning(4) as never, "post-1", null, 10);

    expect(page.cards).toHaveLength(4);
    expect(page.hasMore).toBe(false);
  });

  it("treats an exactly-full page as exhausted", async () => {
    const page = await fetchResponsePage(supabaseReturning(10) as never, "post-1", null, 10);

    expect(page.cards).toHaveLength(10);
    expect(page.hasMore).toBe(false);
  });
});

describe("enrichPosts comment counts", () => {
  it("carries a comment count alongside, not instead of, the response count", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults({
        data: [{ id: "post-1", author_id: "author-1", tags: [] }],
        error: null,
      }),
      // getCountsByPostId tallies rows by post_id.
      comments: queueResults({
        data: [{ post_id: "post-1" }, { post_id: "post-1" }, { post_id: "post-1" }],
        error: null,
      }),
    });

    const page = await fetchResponsePage(supabase as never, "parent-1", null, 10);
    const card = page.cards[0] as { comment_count?: number; response_count?: number };

    expect(card.comment_count).toBe(3);
    // response_count feeds postQuality/feedRanking; folding comments into it
    // would silently change feed order.
    expect(card.response_count).toBe(0);
  });
});

/**
 * A `posts` table that actually honours `limit` and `range`, which the shared
 * mock does not -- and the paging bug this covers is entirely about which rows
 * those two windows hand back.
 *
 * Every other table answers empty, so a post's score comes from the columns on
 * its own row (`view_count`) rather than from joined engagement.
 */
function feedSupabase(rows: Array<Record<string, unknown>>) {
  const postQueries: Array<{ limit: number | null; range: [number, number] | null }> = [];

  const makePostsBuilder = () => {
    // enrichPosts re-enters the posts table twice -- once to count responses
    // (`select("in_response_to")`) and once to resolve parents. Neither is the
    // feed query, and both must answer empty or they'd be read as feed rows.
    let isFeedQuery = false;
    const call: { limit: number | null; range: [number, number] | null } = {
      limit: null,
      range: null,
    };

    const result = () => {
      if (!isFeedQuery) return { data: [], error: null };
      if (call.range) return { data: rows.slice(call.range[0], call.range[1] + 1), error: null };
      if (call.limit !== null) return { data: rows.slice(0, call.limit), error: null };
      return { data: rows, error: null };
    };

    const builder: Record<string, unknown> = {
      select: vi.fn((columns?: string) => {
        if (typeof columns === "string" && columns.startsWith("id, title, slug")) {
          isFeedQuery = true;
          postQueries.push(call);
        }
        return builder;
      }),
      limit: vi.fn((value: number) => {
        call.limit = value;
        return builder;
      }),
      range: vi.fn((from: number, to: number) => {
        call.range = [from, to];
        return builder;
      }),
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };

    for (const method of ["eq", "neq", "in", "not", "is", "lt", "lte", "gt", "gte", "order"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  };

  const supabase = {
    from: vi.fn((table: string) =>
      table === "posts" ? makePostsBuilder() : makeBuilder({ data: [], error: null })
    ),
  };

  return { supabase, postQueries };
}

function rankedRow(index: number, viewCount: number) {
  return {
    id: `p${index}`,
    author_id: "author-1",
    title: `Post ${index}`,
    slug: `post-${index}`,
    type: "blog",
    content_kind: "post",
    tags: [],
    view_count: viewCount,
    // Newest first, one hour apart, so `index` is also the date order.
    published_at: new Date(Date.UTC(2026, 6, 22, 23 - index)).toISOString(),
    created_at: new Date(Date.UTC(2026, 6, 22, 23 - index)).toISOString(),
  };
}

const rankedOptions = {
  tab: "home" as const,
  pageSize: 12,
  type: null,
  timeframe: "all" as const,
  userId: "viewer-1",
  userInterests: [] as string[],
  userUniversity: null,
  followedIds: [] as string[],
};

describe("fetchFeedPage -- ranked home feed paging", () => {
  // 24 fresh posts nobody has read yet (score 0, since scorePost zeroes a post
  // with no engagement) and 6 older ones with real traffic. The old code sized
  // its candidate pool by page number, so page 1 never saw the older six and
  // page 2 did -- they entered the ranking above everything, shoving page 1's
  // tail down into page 2's slice.
  const rows = [
    ...Array.from({ length: 24 }, (_, index) => rankedRow(index, 0)),
    ...Array.from({ length: 6 }, (_, index) => rankedRow(24 + index, 1000)),
  ];

  it("never serves the same post on two pages", async () => {
    const first = feedSupabase(rows);
    const second = feedSupabase(rows);

    const pageOne = await fetchFeedPage({
      ...rankedOptions,
      supabase: first.supabase as never,
      page: 1,
    });
    const pageTwo = await fetchFeedPage({
      ...rankedOptions,
      supabase: second.supabase as never,
      page: 2,
    });

    const firstIds = pageOne.posts.map((post) => post.id);
    const secondIds = pageTwo.posts.map((post) => post.id);

    expect(firstIds).toHaveLength(12);
    expect(secondIds).toHaveLength(12);
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
    // Together they are the first 24 of one ranking, not two different ones:
    // the six read posts lead, then the fresh ones in date order.
    expect([...firstIds, ...secondIds]).toEqual([
      "p24", "p25", "p26", "p27", "p28", "p29",
      ...Array.from({ length: 18 }, (_, index) => `p${index}`),
    ]);
  });

  it("ranks the same fixed window whatever page is asked for", async () => {
    const first = feedSupabase(rows);
    const second = feedSupabase(rows);

    await fetchFeedPage({ ...rankedOptions, supabase: first.supabase as never, page: 1 });
    await fetchFeedPage({ ...rankedOptions, supabase: second.supabase as never, page: 2 });

    // One row past the window, so the last ranked page can tell whether the
    // chronological tail holds anything.
    expect(first.postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
    expect(second.postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
  });

  it("pages the tail past the ranked window chronologically", async () => {
    // The window is the newest RANKED_FEED_WINDOW posts by date, so the tail
    // starting at that same date offset cannot repeat one of them.
    const deep = Array.from({ length: RANKED_FEED_WINDOW + 20 }, (_, index) =>
      rankedRow(index, 0)
    );
    const { supabase, postQueries } = feedSupabase(deep);
    const page = RANKED_FEED_WINDOW / 12 + 1;

    const result = await fetchFeedPage({ ...rankedOptions, supabase: supabase as never, page });

    expect(postQueries[0].range).toEqual([RANKED_FEED_WINDOW, RANKED_FEED_WINDOW + 12]);
    expect(result.posts.map((post) => post.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `p${RANKED_FEED_WINDOW + index}`)
    );
    expect(result.hasMore).toBe(true);
  });
});
