import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  FeedCursorError,
  MAX_FEED_PAGE,
  MAX_FEED_PAGE_SIZE,
  RANKED_FEED_WINDOW,
  fetchFeedPage,
  normalizeFeedContentFilter,
} from "./feedData";
import { makeBuilder, makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(createAdminClient).mockReset();
});

describe("normalizeFeedContentFilter", () => {
  it.each([
    ["post", "post"],
    ["blog", "post"],
    ["article", "article"],
    ["essay", "article"],
    ["policy_brief", "article"],
    // Research is no longer a product; an old `type=research` link means All.
    ["research", "all"],
    ["unknown", "all"],
    [null, "all"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeFeedContentFilter(input)).toBe(expected);
  });
});

interface PostQuery {
  select: string | null;
  limit: number | null;
  range: [number, number] | null;
  orders: Array<{ column: string; options: unknown }>;
  keysetFilters: string[];
  inFilters: Array<{ column: string; values: unknown[] }>;
  notFilters: Array<{ column: string; operator: string; value: unknown }>;
}

/**
 * A `posts` table that honours `limit`, `range`, the author filters, the id
 * anti-filter and the keyset cursor, which the shared mock does not -- and the
 * paging contracts below are entirely about which rows those hand back. Every
 * other table answers empty, so a post's score comes from its own row.
 */
function feedSupabase(
  rows: Array<Record<string, unknown>>,
  {
    excludedCredits = [] as Array<{ post_id: string }>,
    excludedCreditsError = null as { code: string; message: string } | null,
    withRpc = false,
  } = {}
) {
  const postQueries: PostQuery[] = [];
  const tables: string[] = [];
  let postAuthorQueryCount = 0;

  const makePostsBuilder = () => {
    let isFeedQuery = false;
    const excludedPostIds = new Set<string>();
    let keysetPosition: { publishedAt: string; id: string } | null = null;
    const call: PostQuery = {
      select: null,
      limit: null,
      range: null,
      orders: [],
      keysetFilters: [],
      inFilters: [],
      notFilters: [],
    };

    const result = () => {
      if (!isFeedQuery) return { data: [], error: null };
      const visible = rows.filter((row) => {
        if (excludedPostIds.has(String(row.id))) return false;
        const excludedAuthors = call.notFilters.find(
          (filter) => filter.column === "author_id" && filter.operator === "in"
        );
        if (
          excludedAuthors &&
          String(excludedAuthors.value)
            .replace(/^\(|\)$/g, "")
            .split(",")
            .includes(String(row.author_id ?? ""))
        ) {
          return false;
        }
        const authors = call.inFilters.find((filter) => filter.column === "author_id");
        if (authors && !authors.values.includes(String(row.author_id ?? ""))) {
          return false;
        }
        if (keysetPosition) {
          const publishedAt = String(row.published_at ?? "");
          const id = String(row.id ?? "");
          if (
            !(
              publishedAt < keysetPosition.publishedAt ||
              (publishedAt === keysetPosition.publishedAt && id < keysetPosition.id)
            )
          ) {
            return false;
          }
        }
        return true;
      });
      if (call.range) {
        return { data: visible.slice(call.range[0], call.range[1] + 1), error: null };
      }
      if (call.limit !== null) {
        return { data: visible.slice(0, call.limit), error: null };
      }
      return { data: visible, error: null };
    };

    const builder: Record<string, unknown> = {
      select: vi.fn((columns?: string) => {
        if (typeof columns === "string" && columns.startsWith("id, title, slug")) {
          isFeedQuery = true;
          call.select = columns;
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
      order: vi.fn((column: string, options: unknown) => {
        call.orders.push({ column, options });
        return builder;
      }),
      not: vi.fn((column: string, operator: string, value: unknown) => {
        call.notFilters.push({ column, operator, value });
        if (column === "id" && operator === "in" && typeof value === "string") {
          for (const id of value.replace(/^\(|\)$/g, "").split(",")) {
            if (id) excludedPostIds.add(id);
          }
        }
        return builder;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        call.inFilters.push({ column, values });
        return builder;
      }),
      or: vi.fn((filter: string) => {
        call.keysetFilters.push(filter);
        const match = filter.match(
          /^published_at\.lt\.([^,]+),and\(published_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/
        );
        if (match && match[1] === match[2]) {
          keysetPosition = { publishedAt: match[1], id: match[3] };
        }
        return builder;
      }),
      then: (
        onFulfilled: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };

    for (const method of ["eq", "neq", "is", "lt", "lte", "gt", "gte"]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  };

  const rpc = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const supabase = {
    from: vi.fn((table: string) => {
      tables.push(table);
      if (table === "posts") return makePostsBuilder();
      if (table === "post_authors") {
        const isExcludedCreditLookup = postAuthorQueryCount === 0;
        postAuthorQueryCount += 1;
        const error = isExcludedCreditLookup ? excludedCreditsError : null;
        return makeBuilder({
          data: error ? null : isExcludedCreditLookup ? excludedCredits : [],
          error,
        });
      }
      return makeBuilder({ data: [], error: null });
    }),
    // Omitted unless a test asks, so the default double exercises the path a
    // narrow client with no `rpc` takes.
    ...(withRpc ? { rpc } : {}),
  };

  return { supabase, postQueries, tables, rpc };
}

function rankedRow(index: number, reads = 0, overrides: Record<string, unknown> = {}) {
  // Newest first, one hour apart, so `index` is also the date order.
  const publishedAt = new Date(Date.UTC(2026, 6, 22, 23 - index)).toISOString();
  return {
    id: `p${index}`,
    author_id: "author-1",
    title: `Post ${index}`,
    slug: `post-${index}`,
    type: "blog",
    content_kind: "post",
    tags: [],
    read_count: reads,
    impression_count: 0,
    published_at: publishedAt,
    created_at: publishedAt,
    ...overrides,
  };
}

const forYou = {
  tab: "home" as const,
  page: 1,
  pageSize: 12,
  type: null,
  timeframe: "all" as const,
  userId: "viewer-1",
  userInterests: [] as string[],
  followedIds: [] as string[],
};

const following = {
  ...forYou,
  tab: "following" as const,
  followedIds: ["author-1"],
};

describe("fetchFeedPage -- correctness contracts", () => {
  it("caps page and pageSize before building an offset query", async () => {
    const { supabase, postQueries } = feedSupabase([]);

    await fetchFeedPage({
      ...forYou,
      supabase: supabase as never,
      page: 999_999,
      pageSize: 999,
    });

    expect(postQueries[0].range).toEqual([
      (MAX_FEED_PAGE - 1) * MAX_FEED_PAGE_SIZE,
      MAX_FEED_PAGE * MAX_FEED_PAGE_SIZE,
    ]);
  });

  it("uses id as a deterministic tie-breaker for Following", async () => {
    const { supabase, postQueries } = feedSupabase([]);

    await fetchFeedPage({ ...following, supabase: supabase as never });

    expect(postQueries[0].orders).toEqual([
      { column: "published_at", options: { ascending: false } },
      { column: "id", options: { ascending: false } },
    ]);
  });

  it("propagates the main feed query error instead of returning an empty page", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults({
        data: null,
        error: { code: "42P01", message: "relation is unavailable" },
      }),
    });

    await expect(
      fetchFeedPage({ ...following, supabase: supabase as never })
    ).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load following feed",
      code: "42P01",
    });
  });

  it("excludes a post when a blocked user is an accepted coauthor", async () => {
    const { supabase } = feedSupabase([rankedRow(0), rankedRow(1)], {
      excludedCredits: [{ post_id: "p0" }],
    });

    const page = await fetchFeedPage({
      ...forYou,
      supabase: supabase as never,
      excludedAuthorIds: ["blocked-coauthor"],
    });

    expect(page.posts.map((post) => post.id)).toEqual(["p1"]);
  });

  it("propagates a failed blocked-credit lookup", async () => {
    const { supabase } = feedSupabase([rankedRow(0)], {
      excludedCreditsError: { code: "42501", message: "credits denied" },
    });

    await expect(
      fetchFeedPage({
        ...forYou,
        supabase: supabase as never,
        excludedAuthorIds: ["blocked-1"],
      })
    ).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load posts credited to excluded authors",
      code: "42501",
    });
  });

  it("reads visible comment counts through the viewer's RLS client", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    const admin = makeFakeSupabase({
      posts: queueResults({ data: [rankedRow(0)], error: null }),
      comments: queueResults({
        data: [{ post_id: "p0" }, { post_id: "p0" }, { post_id: "p0" }],
        error: null,
      }),
    });
    const viewer = makeFakeSupabase({
      comments: queueResults({ data: [{ post_id: "p0" }], error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const page = await fetchFeedPage({ ...following, supabase: viewer as never });

    expect(page.posts[0].comment_count).toBe(1);
    expect(admin.builders.comments).toBeUndefined();
    expect(viewer.builders.comments).toHaveLength(1);
  });

  it("hydrates a historic response as an ordinary card", async () => {
    const response = { ...rankedRow(0), in_response_to: "parent-1" };
    const { supabase } = feedSupabase([response]);

    const page = await fetchFeedPage({ ...following, supabase: supabase as never });

    expect(page.posts[0]).not.toHaveProperty("response_count");
    expect(page.posts[0]).not.toHaveProperty("response_to");
  });

  it("hydrates cards with none of the retired card metadata", async () => {
    const { supabase, tables } = feedSupabase([rankedRow(0)]);

    const page = await fetchFeedPage({ ...forYou, supabase: supabase as never });

    for (const field of [
      "co_authors",
      "reference_count",
      "quality_badges",
      "surface_reason",
      "quality_score",
      "subscription_match",
    ]) {
      expect(page.posts[0]).not.toHaveProperty(field);
    }
    // No co-author credits and no references are read to build a card.
    for (const table of ["post_authors", "post_references", "post_reference_counts"]) {
      expect(tables).not.toContain(table);
    }
  });

  it("selects For You in one query, with no evergreen arm and no reader-signal RPC", async () => {
    const deep = Array.from({ length: RANKED_FEED_WINDOW + 20 }, (_, index) =>
      rankedRow(index)
    );
    const { supabase, postQueries, rpc } = feedSupabase(deep, { withRpc: true });

    await fetchFeedPage({ ...forYou, supabase: supabase as never });

    expect(postQueries).toHaveLength(1);
    expect(postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
    expect(postQueries[0].keysetFilters).toEqual([]);
    const called = rpc.mock.calls.map((call) => (call as unknown[])[0]);
    expect(called).not.toContain("get_reader_affinity");
    expect(called).not.toContain("get_viewer_post_engagement");
  });
});

describe("fetchFeedPage -- Following", () => {
  it("continues with a bound (published_at, id) cursor", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => rankedRow(index));
    const firstPage = await fetchFeedPage({
      ...following,
      supabase: feedSupabase(rows).supabase as never,
      pageSize: 2,
    });

    expect(firstPage.posts.map((post) => post.id)).toEqual(["p0", "p1"]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const second = feedSupabase(rows);
    const secondPage = await fetchFeedPage({
      ...following,
      supabase: second.supabase as never,
      page: 99,
      pageSize: 2,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.posts.map((post) => post.id)).toEqual(["p2"]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
    expect(second.postQueries[0].keysetFilters).toHaveLength(1);
  });

  it("uses id to continue safely when published_at values tie", async () => {
    const publishedAt = "2026-08-18T12:00:00.000Z";
    const rows = ["c", "b", "a"].map((id) => ({
      ...rankedRow(0),
      id,
      slug: id,
      published_at: publishedAt,
      created_at: publishedAt,
    }));
    const firstPage = await fetchFeedPage({
      ...following,
      supabase: feedSupabase(rows).supabase as never,
      pageSize: 2,
    });
    const secondPage = await fetchFeedPage({
      ...following,
      supabase: feedSupabase(rows).supabase as never,
      pageSize: 2,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.posts.map((post) => post.id)).toEqual(["c", "b"]);
    expect(secondPage.posts.map((post) => post.id)).toEqual(["a"]);
  });

  it("rejects malformed, unsupported-version, and mismatched cursors", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => rankedRow(index));
    const firstPage = await fetchFeedPage({
      ...following,
      supabase: feedSupabase(rows).supabase as never,
      pageSize: 2,
    });

    await expect(
      fetchFeedPage({
        ...following,
        supabase: feedSupabase(rows).supabase as never,
        cursor: "not.a.cursor",
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    const wrongVersion = Buffer.from(JSON.stringify({ version: 2 }), "utf8").toString(
      "base64url"
    );
    await expect(
      fetchFeedPage({
        ...following,
        supabase: feedSupabase(rows).supabase as never,
        cursor: wrongVersion,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...following,
        supabase: feedSupabase(rows).supabase as never,
        type: "article",
        cursor: firstPage.nextCursor,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...following,
        supabase: feedSupabase(rows).supabase as never,
        timeframe: "week",
        cursor: firstPage.nextCursor,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...forYou,
        supabase: feedSupabase(rows).supabase as never,
        cursor: firstPage.nextCursor,
      })
    ).rejects.toMatchObject({
      name: "FeedCursorError",
      message: "Cursors are not supported by the ranked home feed.",
    });
  });

  it("still continues a Following cursor minted before Phase 2F", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => rankedRow(index));
    const legacy = Buffer.from(
      JSON.stringify({
        version: 1,
        tab: "following",
        type: "all",
        timeframe: "all",
        subscriptionSource: null,
        publishedAt: rows[1].published_at,
        id: "p1",
      }),
      "utf8"
    ).toString("base64url");

    const page = await fetchFeedPage({
      ...following,
      supabase: feedSupabase(rows).supabase as never,
      cursor: legacy,
    });

    expect(page.posts.map((post) => post.id)).toEqual(["p2"]);
  });

  it.each(["latest", "topics", "subscriptions"])(
    "refuses a cursor from the retired %s mode",
    async (tab) => {
      const rows = [rankedRow(0), rankedRow(1)];
      const retired = Buffer.from(
        JSON.stringify({
          version: 1,
          tab,
          type: "all",
          timeframe: "all",
          subscriptionSource: null,
          publishedAt: rows[0].published_at,
          id: "p0",
        }),
        "utf8"
      ).toString("base64url");

      await expect(
        fetchFeedPage({
          ...following,
          supabase: feedSupabase(rows).supabase as never,
          cursor: retired,
        })
      ).rejects.toBeInstanceOf(FeedCursorError);
    }
  );

  it("answers an empty page without a query when the reader follows nobody", async () => {
    const { supabase, postQueries } = feedSupabase([rankedRow(0)]);

    const page = await fetchFeedPage({
      ...following,
      followedIds: [],
      supabase: supabase as never,
    });

    expect(page).toEqual({ posts: [], hasMore: false, nextCursor: null });
    expect(postQueries).toHaveLength(0);
  });

  it("never asks for a blocked writer, even one the reader follows", async () => {
    const { supabase, postQueries } = feedSupabase([rankedRow(0)]);

    await fetchFeedPage({
      ...following,
      followedIds: ["author-1", "blocked-1"],
      excludedAuthorIds: ["blocked-1"],
      supabase: supabase as never,
    });

    expect(postQueries[0].inFilters).toContainEqual({
      column: "author_id",
      values: ["author-1"],
    });
  });
});

describe("fetchFeedPage -- ranked For You paging", () => {
  // 24 fresh-order posts nobody has read and 6 older ones with real reads. A
  // candidate pool sized by page number would let page 2's pool slot the read
  // posts above everything page 1 already delivered.
  const rows = [
    ...Array.from({ length: 24 }, (_, index) => rankedRow(index, 0)),
    ...Array.from({ length: 6 }, (_, index) => rankedRow(24 + index, 1000)),
  ];

  it("never serves the same post on two pages", async () => {
    const pageOne = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase(rows).supabase as never,
      page: 1,
    });
    const pageTwo = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase(rows).supabase as never,
      page: 2,
    });

    const firstIds = pageOne.posts.map((post) => post.id);
    const secondIds = pageTwo.posts.map((post) => post.id);

    expect(firstIds).toHaveLength(12);
    expect(secondIds).toHaveLength(12);
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
    // Together they are the first 24 of one ranking: the six read posts lead,
    // then the unread ones in date order.
    expect([...firstIds, ...secondIds]).toEqual([
      "p24", "p25", "p26", "p27", "p28", "p29",
      ...Array.from({ length: 18 }, (_, index) => `p${index}`),
    ]);
  });

  it("ranks the same fixed window whatever page is asked for", async () => {
    const first = feedSupabase(rows);
    const second = feedSupabase(rows);

    await fetchFeedPage({ ...forYou, supabase: first.supabase as never, page: 1 });
    await fetchFeedPage({ ...forYou, supabase: second.supabase as never, page: 2 });

    // One row past the window, so the last ranked page can tell whether the
    // date-ordered tail holds anything.
    expect(first.postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
    expect(second.postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
  });

  it("pages past the ranked window in date order, from the row after it", async () => {
    const deep = Array.from({ length: 180 }, (_, index) => rankedRow(index));
    const { supabase, postQueries } = feedSupabase(deep);

    const result = await fetchFeedPage({
      ...forYou,
      supabase: supabase as never,
      page: RANKED_FEED_WINDOW / 12 + 1,
    });

    expect(result.posts.map((post) => post.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `p${RANKED_FEED_WINDOW + index}`)
    );
    expect(result.hasMore).toBe(true);
    expect(postQueries).toHaveLength(1);
    expect(postQueries[0].range).toEqual([RANKED_FEED_WINDOW, RANKED_FEED_WINDOW + 12]);
  });

  it("labels each card with the part of the feed that supplied it", async () => {
    const deep = Array.from({ length: 180 }, (_, index) => rankedRow(index));

    const ranked = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase(deep).supabase as never,
      page: 1,
    });
    const tail = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase(deep).supabase as never,
      page: RANKED_FEED_WINDOW / 12 + 1,
    });

    expect(new Set(ranked.posts.map((post) => post.candidate_source))).toEqual(
      new Set(["for_you_ranked"])
    );
    expect(new Set(tail.posts.map((post) => post.candidate_source))).toEqual(
      new Set(["for_you_tail"])
    );
  });

  it("serves every post exactly once across the ranked window and the tail", async () => {
    const deep = Array.from({ length: 180 }, (_, index) => rankedRow(index));
    const served: string[] = [];

    for (let page = 1; page <= 180 / 12; page += 1) {
      const result = await fetchFeedPage({
        ...forYou,
        supabase: feedSupabase(deep).supabase as never,
        page,
      });
      served.push(...result.posts.map((post) => post.id));
    }

    // No repeats is the visible half of the contract. No gaps is the half that
    // fails silently: a post skipped between the window and the tail never
    // arrives at all, and nobody reports it.
    expect(new Set(served).size).toBe(served.length);
    expect(new Set(served)).toEqual(new Set(deep.map((row) => row.id)));
  });

  it("lifts a followed writer and a chosen topic above an equal stranger", async () => {
    const candidates = [
      rankedRow(0, 0, { author_id: "stranger" }),
      rankedRow(1, 0, { author_id: "followed" }),
      rankedRow(2, 0, { author_id: "topical", tags: ["Climate Policy"] }),
    ];

    const result = await fetchFeedPage({
      ...forYou,
      followedIds: ["followed"],
      userInterests: ["climate policy"],
      supabase: feedSupabase(candidates).supabase as never,
    });

    expect(result.posts.map((post) => post.id)).toEqual(["p1", "p2", "p0"]);
  });
});
