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
    failLargeFeedQuery = false,
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
      if (failLargeFeedQuery && call.limit === RANKED_FEED_WINDOW + 1) {
        return {
          data: null,
          error: { code: "57014", message: "candidate window timed out" },
        };
      }
      const visible = rows.filter((row) => {
        if (excludedPostIds.has(String(row.id))) return false;
        const includedIds = call.inFilters.find((filter) => filter.column === "id");
        if (includedIds && !includedIds.values.includes(String(row.id ?? ""))) {
          return false;
        }
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
      ...following,
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

  it("builds the For You snapshot once and reads the two bounded reader-signal RPCs", async () => {
    const deep = Array.from({ length: RANKED_FEED_WINDOW + 20 }, (_, index) =>
      rankedRow(index)
    );
    const { supabase, postQueries, rpc } = feedSupabase(deep, { withRpc: true });

    await fetchFeedPage({ ...forYou, supabase: supabase as never });

    expect(postQueries).toHaveLength(1);
    expect(postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
    expect(postQueries[0].keysetFilters).toEqual([]);
    const called = rpc.mock.calls.map((call) => (call as unknown[])[0]);
    expect(called).toContain("get_feed_ranking_metrics");
    expect(called).toContain("get_reader_affinity");
    expect(called).toContain("get_viewer_post_engagement");
    expect(called).toContain("hydrate_feed_cards");

    const rankingCall = rpc.mock.calls.find(
      (call) => (call as unknown[])[0] === "get_feed_ranking_metrics"
    ) as unknown[] | undefined;
    const cardCall = rpc.mock.calls.find(
      (call) => (call as unknown[])[0] === "hydrate_feed_cards"
    ) as unknown[] | undefined;
    expect((rankingCall?.[1] as { p_post_ids: string[] }).p_post_ids).toHaveLength(
      RANKED_FEED_WINDOW
    );
    // The critical stability contract: broad ranking, narrow card hydration.
    expect((cardCall?.[1] as { p_post_ids: string[] }).p_post_ids).toHaveLength(12);
  });

  it("falls back to a small strict chronological page when the broad candidate read times out", async () => {
    const rows = Array.from({ length: 40 }, (_, index) => rankedRow(index));
    const { supabase, postQueries } = feedSupabase(rows, {
      failLargeFeedQuery: true,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const page = await fetchFeedPage({ ...forYou, supabase: supabase as never });

    expect(postQueries).toHaveLength(2);
    expect(postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);
    expect(postQueries[1].limit).toBe(13);
    expect(page.posts.map((post) => post.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `p${index}`)
    );
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toMatch(/^fy4\./);
    warn.mockRestore();
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
    ).rejects.toBeInstanceOf(FeedCursorError);
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

describe("fetchFeedPage -- For You snapshot paging", () => {
  const rows = Array.from({ length: 30 }, (_, index) =>
    rankedRow(index, index >= 24 ? 1000 : 0, { author_id: `author-${index}` })
  );

  it("freezes the order so a newly published post cannot slide a page boundary", async () => {
    const pageOne = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase(rows).supabase as never,
      page: 1,
    });
    expect(pageOne.nextCursor).toMatch(/^fy4\./);

    const firstIds = pageOne.posts.map((post) => post.id);
    const brandNew = rankedRow(999, 10_000, {
      id: "brand-new",
      author_id: "brand-new-author",
      published_at: "2026-09-23T12:00:00.000Z",
      created_at: "2026-09-23T12:00:00.000Z",
    });
    const pageTwo = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase([brandNew, ...rows]).supabase as never,
      page: 2,
      cursor: pageOne.nextCursor,
    });

    const secondIds = pageTwo.posts.map((post) => post.id);
    expect(secondIds).toHaveLength(12);
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
    expect(secondIds).not.toContain("brand-new");
    expect(secondIds.every((id) => rows.some((row) => row.id === id))).toBe(true);
  });

  it("requires the previous snapshot cursor for page two and later", async () => {
    await expect(
      fetchFeedPage({
        ...forYou,
        supabase: feedSupabase(rows).supabase as never,
        page: 2,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);
  });

  it("rejects a tampered snapshot cursor", async () => {
    const pageOne = await fetchFeedPage({
      ...forYou,
      supabase: feedSupabase(rows).supabase as never,
      page: 1,
    });
    const cursor = pageOne.nextCursor!;
    const replacement = cursor.endsWith("a") ? "b" : "a";
    const tampered = `${cursor.slice(0, -1)}${replacement}`;

    await expect(
      fetchFeedPage({
        ...forYou,
        supabase: feedSupabase(rows).supabase as never,
        page: 2,
        cursor: tampered,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);
  });

  it("ranks one fixed candidate window on the first request only", async () => {
    const first = feedSupabase(rows);
    const pageOne = await fetchFeedPage({
      ...forYou,
      supabase: first.supabase as never,
      page: 1,
    });
    expect(first.postQueries[0].limit).toBe(RANKED_FEED_WINDOW + 1);

    const second = feedSupabase(rows);
    await fetchFeedPage({
      ...forYou,
      supabase: second.supabase as never,
      page: 2,
      cursor: pageOne.nextCursor,
    });

    // Continuation resolves the frozen ids with an id IN query; it does not
    // reload and rerank the newest candidate window.
    expect(second.postQueries.some((query) => query.limit === RANKED_FEED_WINDOW + 1)).toBe(false);
    expect(second.postQueries.some((query) => query.inFilters.some((filter) => filter.column === "id"))).toBe(true);
  });

  it("labels ranked cards with their hybrid candidate lane", async () => {
    const result = await fetchFeedPage({
      ...forYou,
      userInterests: ["climate policy"],
      followedIds: ["author-0"],
      supabase: feedSupabase([
        rankedRow(0, 0, { author_id: "author-0", tags: ["Climate Policy"] }),
        ...rows.slice(1),
      ]).supabase as never,
    });

    const allowed = new Set([
      "for_you_personalized",
      "for_you_fresh",
      "for_you_discovery",
      "for_you_trending",
      "for_you_evergreen",
    ]);
    expect(result.posts).toHaveLength(12);
    expect(result.posts.every((post) => allowed.has(String(post.candidate_source)))).toBe(true);
    expect(result.posts.some((post) => post.candidate_source === "for_you_personalized")).toBe(true);
  });

  it("continues into a chronological tail after the frozen ranked window", async () => {
    const deep = Array.from({ length: RANKED_FEED_WINDOW + 24 }, (_, index) =>
      rankedRow(index, 0, { author_id: `author-${index}` })
    );
    let cursor: string | null | undefined = null;
    let tailPage: Awaited<ReturnType<typeof fetchFeedPage>> | null = null;

    for (let page = 1; page <= RANKED_FEED_WINDOW / 12 + 1; page += 1) {
      const result = await fetchFeedPage({
        ...forYou,
        supabase: feedSupabase(deep).supabase as never,
        page,
        cursor,
      });
      cursor = result.nextCursor;
      if (page === RANKED_FEED_WINDOW / 12 + 1) tailPage = result;
    }

    expect(tailPage?.posts.map((post) => post.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `p${RANKED_FEED_WINDOW + index}`)
    );
    expect(new Set(tailPage?.posts.map((post) => post.candidate_source))).toEqual(
      new Set(["for_you_tail"])
    );
  });

  it("serves every post exactly once across the frozen ranking and tail", async () => {
    const deep = Array.from({ length: RANKED_FEED_WINDOW + 24 }, (_, index) =>
      rankedRow(index, 0, { author_id: `author-${index}` })
    );
    const served: string[] = [];
    let cursor: string | null | undefined = null;

    for (let page = 1; page <= 30; page += 1) {
      const result = await fetchFeedPage({
        ...forYou,
        supabase: feedSupabase(deep).supabase as never,
        page,
        cursor,
      });
      served.push(...result.posts.map((post) => post.id));
      cursor = result.nextCursor;
      if (!result.hasMore) break;
    }

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

    expect(new Set(result.posts.map((post) => post.id).slice(0, 2))).toEqual(new Set(["p1", "p2"]));
  });
});
