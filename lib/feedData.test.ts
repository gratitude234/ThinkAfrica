import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import {
  FeedCursorError,
  FeedDataError,
  MAX_FEED_PAGE,
  MAX_FEED_PAGE_SIZE,
  RANKED_FEED_WINDOW,
  applyPostFilters,
  fetchFeedPage,
  fetchResponsePage,
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

  it("excludes posts credited to blocked coauthors by id", () => {
    const { query, calls } = makeQuerySpy();

    applyPostFilters(query, {
      type: null,
      cutoff: null,
      excludedPostIds: ["post-1", "post-2"],
    });

    expect(calls).toContainEqual({
      method: "not",
      args: ["id", "in", "(post-1,post-2)"],
    });
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

  it("caps an excessive response page size", async () => {
    const supabase = supabaseReturning(MAX_FEED_PAGE_SIZE + 1);

    const page = await fetchResponsePage(
      supabase as never,
      "post-1",
      null,
      Number.POSITIVE_INFINITY
    );

    // Invalid non-finite input falls back to the response default, with one
    // additional row used solely to establish hasMore.
    expect(supabase.builders.posts[0].limit).toHaveBeenCalledWith(11);
    expect(page.cards).toHaveLength(10);
  });

  it("orders response pages by id after published_at", async () => {
    const supabase = supabaseReturning(1);

    await fetchResponsePage(supabase as never, "post-1", null, 10);

    expect(supabase.builders.posts[0].order).toHaveBeenNthCalledWith(
      1,
      "published_at",
      { ascending: false }
    );
    expect(supabase.builders.posts[0].order).toHaveBeenNthCalledWith(
      2,
      "id",
      { ascending: false }
    );
  });

  it("propagates response query failures with the database code", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults({
        data: null,
        error: { code: "42501", message: "permission denied" },
      }),
    });

    const promise = fetchResponsePage(
      supabase as never,
      "post-1",
      null,
      10
    );

    await expect(promise).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load responses for post",
      code: "42501",
    });
    await expect(promise).rejects.toBeInstanceOf(FeedDataError);
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

  it("counts only published Responses", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults(
        {
          data: [{ id: "post-1", author_id: "author-1", tags: [] }],
          error: null,
        },
        {
          data: [{ in_response_to: "post-1" }],
          error: null,
        }
      ),
    });

    const page = await fetchResponsePage(
      supabase as never,
      "parent-1",
      null,
      10
    );

    expect(page.cards[0].response_count).toBe(1);
    expect(supabase.builders.posts[1].eq).toHaveBeenCalledWith(
      "status",
      "published"
    );
  });

  it("does not turn a failed aggregate into a zero count", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults(
        {
          data: [{ id: "post-1", author_id: "author-1", tags: [] }],
          error: null,
        },
        { data: [], error: null }
      ),
      comments: queueResults({
        data: null,
        error: { code: "XX000", message: "comments unavailable" },
      }),
    });

    await expect(
      fetchResponsePage(supabase as never, "parent-1", null, 10)
    ).rejects.toMatchObject({
      operation: "count comments",
      code: "XX000",
    });
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
function feedSupabase(
  rows: Array<Record<string, unknown>>,
  {
    excludedCredits = [] as Array<{ post_id: string; user_id?: string }>,
    excludedCreditsError = null as { code: string; message: string } | null,
    parentRows = [] as Array<Record<string, unknown>>,
    parentError = null as { code: string; message: string } | null,
  } = {}
) {
  const postQueries: Array<{
    select: string | null;
    limit: number | null;
    range: [number, number] | null;
    orders: Array<{ column: string; options: unknown }>;
    keysetFilters: string[];
    inFilters: Array<{ column: string; values: unknown[] }>;
    notFilters: Array<{ column: string; operator: string; value: unknown }>;
  }> = [];
  const parentPostQueries: typeof postQueries = [];
  let postAuthorQueryCount = 0;

  const makePostsBuilder = () => {
    // enrichPosts re-enters the posts table twice -- once to count responses
    // (`select("in_response_to")`) and once to resolve parents. Neither is the
    // feed query, and both must answer empty or they'd be read as feed rows.
    let queryKind: "feed" | "parent" | "other" = "other";
    const excludedPostIds = new Set<string>();
    let keysetPosition: { publishedAt: string; id: string } | null = null;
    const call: {
      select: string | null;
      limit: number | null;
      range: [number, number] | null;
      orders: Array<{ column: string; options: unknown }>;
      keysetFilters: string[];
      inFilters: Array<{ column: string; values: unknown[] }>;
      notFilters: Array<{ column: string; operator: string; value: unknown }>;
    } = {
      select: null,
      limit: null,
      range: null,
      orders: [],
      keysetFilters: [],
      inFilters: [],
      notFilters: [],
    };

    const result = () => {
      if (queryKind === "other") return { data: [], error: null };
      if (queryKind === "parent" && parentError) {
        return { data: null, error: parentError };
      }
      const sourceRows = queryKind === "parent" ? parentRows : rows;
      const visibleRows = sourceRows.flatMap((row) => {
        if (excludedPostIds.has(String(row.id))) return [];
        const idFilter = call.inFilters.find(
          (filter) => filter.column === "id"
        );
        if (idFilter && !idFilter.values.includes(String(row.id ?? ""))) {
          return [];
        }
        const excludedAuthorFilter = call.notFilters.find(
          (filter) =>
            filter.column === "author_id" &&
            filter.operator === "in" &&
            typeof filter.value === "string"
        );
        if (excludedAuthorFilter) {
          const excludedAuthors = String(excludedAuthorFilter.value)
            .replace(/^\(|\)$/g, "")
            .split(",");
          if (excludedAuthors.includes(String(row.author_id ?? ""))) return [];
        }
        if (keysetPosition) {
          const publishedAt = String(row.published_at ?? "");
          const id = String(row.id ?? "");
          if (!(
            publishedAt < keysetPosition.publishedAt ||
            (publishedAt === keysetPosition.publishedAt && id < keysetPosition.id)
          )) return [];
        }

        const authorFilter = call.inFilters.find(
          (filter) => filter.column === "author_id"
        );
        if (
          authorFilter &&
          !authorFilter.values.includes(String(row.author_id ?? ""))
        ) {
          return [];
        }

        const creditFilter = call.inFilters.find(
          (filter) =>
            filter.column === "subscription_author_credits.user_id"
        );
        if (!creditFilter) return [row];
        const rawCredits = row.subscription_author_credits;
        const credits = Array.isArray(rawCredits) ? rawCredits : [];
        const acceptedOnly = call.notFilters.some(
          (filter) =>
            filter.column === "subscription_author_credits.accepted_at" &&
            filter.operator === "is" &&
            filter.value === null
        );
        const matchedCredits = credits.filter((credit) => {
          if (!credit || typeof credit !== "object") return false;
          const typed = credit as { user_id?: string; accepted_at?: string | null };
          return (
            typeof typed.user_id === "string" &&
            creditFilter.values.includes(typed.user_id) &&
            (!acceptedOnly || typed.accepted_at != null)
          );
        });
        return matchedCredits.length > 0
          ? [{ ...row, subscription_author_credits: matchedCredits }]
          : [];
      });
      if (call.range) {
        return {
          data: visibleRows.slice(call.range[0], call.range[1] + 1),
          error: null,
        };
      }
      if (call.limit !== null) {
        return { data: visibleRows.slice(0, call.limit), error: null };
      }
      return { data: visibleRows, error: null };
    };

    const builder: Record<string, unknown> = {
      select: vi.fn((columns?: string) => {
        if (typeof columns === "string" && columns.startsWith("id, title, slug")) {
          queryKind = "feed";
          call.select = columns;
          postQueries.push(call);
        } else if (
          typeof columns === "string" &&
          columns.startsWith("id, slug, title, type, content_kind, author_id")
        ) {
          queryKind = "parent";
          call.select = columns;
          parentPostQueries.push(call);
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

    for (const method of [
      "eq",
      "neq",
      "is",
      "lt",
      "lte",
      "gt",
      "gte",
      "overlaps",
    ]) {
      builder[method] = vi.fn(() => builder);
    }
    return builder;
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "posts") return makePostsBuilder();
      if (table === "post_authors") {
        const isExcludedCreditLookup = postAuthorQueryCount === 0;
        const data = isExcludedCreditLookup ? excludedCredits : [];
        const error = isExcludedCreditLookup ? excludedCreditsError : null;
        postAuthorQueryCount += 1;
        return makeBuilder({ data: error ? null : data, error });
      }
      return makeBuilder({ data: [], error: null });
    }),
  };

  return { supabase, postQueries, parentPostQueries };
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

const latestOptions = {
  ...rankedOptions,
  tab: "latest" as const,
  page: 1,
};

describe("fetchFeedPage -- correctness contracts", () => {
  it("caps page and pageSize before building an offset query", async () => {
    const { supabase, postQueries } = feedSupabase([]);

    await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
      page: 999_999,
      pageSize: 999,
    });

    expect(postQueries[0].range).toEqual([
      (MAX_FEED_PAGE - 1) * MAX_FEED_PAGE_SIZE,
      MAX_FEED_PAGE * MAX_FEED_PAGE_SIZE,
    ]);
  });

  it("uses id as a deterministic tie-breaker for chronological feeds", async () => {
    const { supabase, postQueries } = feedSupabase([]);

    await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
    });

    expect(postQueries[0].orders).toEqual([
      { column: "published_at", options: { ascending: false } },
      { column: "id", options: { ascending: false } },
    ]);
  });

  it("does not require the pending topic_keys column for an ordinary feed", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults({ data: [], error: null }),
    });

    await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
    });

    const selectedColumns = vi.mocked(supabase.builders.posts[0].select).mock
      .calls[0][0] as string;
    expect(selectedColumns).not.toContain("topic_keys");
  });

  it("propagates the main feed query error instead of returning an empty page", async () => {
    const supabase = makeFakeSupabase({
      posts: queueResults({
        data: null,
        error: { code: "42P01", message: "relation is unavailable" },
      }),
    });

    await expect(
      fetchFeedPage({
        ...latestOptions,
        supabase: supabase as never,
      })
    ).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load latest feed",
      code: "42P01",
    });
  });

  it("excludes a post when a blocked user is an accepted coauthor", async () => {
    const rows = [rankedRow(0, 0), rankedRow(1, 0)];
    const { supabase } = feedSupabase(rows, {
      excludedCredits: [{ post_id: "p0" }],
    });

    const page = await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
      excludedAuthorIds: ["blocked-coauthor"],
    });

    expect(page.posts.map((post) => post.id)).toEqual(["p1"]);
  });

  it("reads visible comment counts through the viewer's RLS client", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
    const admin = makeFakeSupabase({
      posts: queueResults(
        { data: [rankedRow(0, 0)], error: null },
        { data: [], error: null }
      ),
      comments: queueResults({
        data: [
          { post_id: "p0" },
          { post_id: "p0" },
          { post_id: "p0" },
        ],
        error: null,
      }),
    });
    const viewer = makeFakeSupabase({
      comments: queueResults({ data: [{ post_id: "p0" }], error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const page = await fetchFeedPage({
      ...latestOptions,
      supabase: viewer as never,
    });

    expect(page.posts[0].comment_count).toBe(1);
    expect(admin.builders.comments).toBeUndefined();
    expect(viewer.builders.comments).toHaveLength(1);
  });

  it("normalizes interest tags before deriving the surface reason", async () => {
    const row = {
      ...rankedRow(0, 0),
      tags: ["  Climate Policy  "],
    };
    const { supabase } = feedSupabase([row]);

    const page = await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
      userInterests: ["CLIMATE POLICY"],
    });

    expect(page.posts[0].surface_reason).toBe(
      "Matches your reading interests"
    );
  });

  it("does not hydrate response-parent context from an excluded primary author", async () => {
    const response = {
      ...rankedRow(0, 0),
      in_response_to: "parent-1",
    };
    const { supabase, parentPostQueries } = feedSupabase([response], {
      parentRows: [
        {
          id: "parent-1",
          slug: "blocked-parent",
          title: "Blocked parent",
          type: "blog",
          content_kind: "post",
          author_id: "blocked-author",
        },
      ],
    });

    const page = await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
      excludedAuthorIds: ["blocked-author"],
    });

    expect(page.posts[0].response_to).toBeNull();
    expect(parentPostQueries).toHaveLength(1);
    expect(parentPostQueries[0].notFilters).toContainEqual({
      column: "author_id",
      operator: "in",
      value: "(blocked-author)",
    });
    expect(
      supabase.from.mock.calls.filter(([table]) => table === "profiles")
    ).toHaveLength(1);
  });

  it("does not fetch a response parent credited to an excluded coauthor", async () => {
    const response = {
      ...rankedRow(0, 0),
      in_response_to: "parent-1",
    };
    const { supabase, parentPostQueries } = feedSupabase([response], {
      excludedCredits: [{ post_id: "parent-1" }],
      parentRows: [
        {
          id: "parent-1",
          slug: "blocked-parent",
          title: "Blocked parent",
          type: "blog",
          content_kind: "post",
          author_id: "safe-primary-author",
        },
      ],
    });

    const page = await fetchFeedPage({
      ...latestOptions,
      supabase: supabase as never,
      excludedAuthorIds: ["blocked-coauthor"],
    });

    expect(page.posts[0].response_to).toBeNull();
    expect(parentPostQueries).toHaveLength(0);
  });

  it("propagates response-parent query errors", async () => {
    const response = {
      ...rankedRow(0, 0),
      in_response_to: "parent-1",
    };
    const { supabase } = feedSupabase([response], {
      parentError: { code: "42501", message: "parent query denied" },
    });

    await expect(
      fetchFeedPage({
        ...latestOptions,
        supabase: supabase as never,
      })
    ).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load response parent posts",
      code: "42501",
    });
  });
});

describe("fetchFeedPage -- chronological keyset cursors", () => {
  const chronologicalCases = [
    {
      name: "latest",
      options: { tab: "latest" as const },
    },
    {
      name: "following",
      options: {
        tab: "following" as const,
        followedIds: ["author-1"],
      },
    },
    {
      name: "topics",
      options: {
        tab: "topics" as const,
        topicSubscriptionKeys: ["climate"],
      },
    },
    {
      name: "subscriptions",
      options: {
        tab: "subscriptions" as const,
        authorSubscriptionIds: ["author-1"],
        subscriptionSource: "authors" as const,
      },
    },
  ];

  it.each(chronologicalCases)(
    "continues $name with a bound (published_at,id) cursor",
    async ({ options }) => {
      if (options.tab === "topics" || options.tab === "subscriptions") {
        vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
        vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
      }
      if (options.tab === "subscriptions") {
        vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
      }

      const rows = Array.from({ length: 3 }, (_, index) => ({
        ...rankedRow(index, 0),
        topic_keys: ["climate"],
      }));
      const first = feedSupabase(rows);
      const firstPage = await fetchFeedPage({
        ...latestOptions,
        ...options,
        supabase: first.supabase as never,
        pageSize: 2,
      });

      expect(firstPage.posts.map((post) => post.id)).toEqual(["p0", "p1"]);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextCursor).toEqual(expect.any(String));

      const second = feedSupabase(rows);
      const secondPage = await fetchFeedPage({
        ...latestOptions,
        ...options,
        supabase: second.supabase as never,
        page: 99,
        pageSize: 2,
        cursor: firstPage.nextCursor,
      });

      expect(secondPage.posts.map((post) => post.id)).toEqual(["p2"]);
      expect(secondPage.hasMore).toBe(false);
      expect(secondPage.nextCursor).toBeNull();
      expect(second.postQueries[0].keysetFilters).toHaveLength(1);
    }
  );

  it("uses id to continue safely when published_at values tie", async () => {
    const publishedAt = "2026-08-18T12:00:00.000Z";
    const rows = ["c", "b", "a"].map((id) => ({
      ...rankedRow(0, 0),
      id,
      slug: id,
      published_at: publishedAt,
      created_at: publishedAt,
    }));
    const first = feedSupabase(rows);
    const firstPage = await fetchFeedPage({
      ...latestOptions,
      supabase: first.supabase as never,
      pageSize: 2,
    });
    const second = feedSupabase(rows);
    const secondPage = await fetchFeedPage({
      ...latestOptions,
      supabase: second.supabase as never,
      pageSize: 2,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.posts.map((post) => post.id)).toEqual(["c", "b"]);
    expect(secondPage.posts.map((post) => post.id)).toEqual(["a"]);
  });

  it("rejects malformed, unsupported-version, and mismatched cursors", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => rankedRow(index, 0));
    const first = feedSupabase(rows);
    const firstPage = await fetchFeedPage({
      ...latestOptions,
      supabase: first.supabase as never,
      pageSize: 2,
    });

    await expect(
      fetchFeedPage({
        ...latestOptions,
        supabase: feedSupabase(rows).supabase as never,
        cursor: "not.a.cursor",
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    const wrongVersion = Buffer.from(
      JSON.stringify({ version: 2 }),
      "utf8"
    ).toString("base64url");
    await expect(
      fetchFeedPage({
        ...latestOptions,
        supabase: feedSupabase(rows).supabase as never,
        cursor: wrongVersion,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...latestOptions,
        supabase: feedSupabase(rows).supabase as never,
        type: "article",
        cursor: firstPage.nextCursor,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...latestOptions,
        supabase: feedSupabase(rows).supabase as never,
        timeframe: "week",
        cursor: firstPage.nextCursor,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...latestOptions,
        tab: "following",
        followedIds: ["author-1"],
        supabase: feedSupabase(rows).supabase as never,
        cursor: firstPage.nextCursor,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);

    await expect(
      fetchFeedPage({
        ...latestOptions,
        tab: "home",
        supabase: feedSupabase(rows).supabase as never,
        cursor: firstPage.nextCursor,
      })
    ).rejects.toMatchObject({
      name: "FeedCursorError",
      message: "Cursors are not supported by the ranked home feed.",
    });
  });

  it("binds subscription cursors to the selected source", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
    const rows = Array.from({ length: 3 }, (_, index) => rankedRow(index, 0));
    const first = feedSupabase(rows);
    const firstPage = await fetchFeedPage({
      ...latestOptions,
      tab: "subscriptions",
      supabase: first.supabase as never,
      pageSize: 2,
      authorSubscriptionIds: ["author-1"],
      subscriptionSource: "authors",
    });

    await expect(
      fetchFeedPage({
        ...latestOptions,
        tab: "subscriptions",
        supabase: feedSupabase(rows).supabase as never,
        pageSize: 2,
        authorSubscriptionIds: ["author-1"],
        subscriptionSource: "all",
        cursor: firstPage.nextCursor,
      })
    ).rejects.toBeInstanceOf(FeedCursorError);
  });

  it("applies the cursor to every merged subscription post source", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
    const rows = Array.from({ length: 3 }, (_, index) => ({
      ...rankedRow(index, 0),
      topic_keys: ["climate"],
      subscription_author_credits: [
        {
          user_id: "author-1",
          accepted_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    }));
    const options = {
      ...latestOptions,
      tab: "subscriptions" as const,
      pageSize: 2,
      authorSubscriptionIds: ["author-1"],
      topicSubscriptionKeys: ["climate"],
      subscriptionSource: "all" as const,
    };
    const first = feedSupabase(rows);
    const firstPage = await fetchFeedPage({
      ...options,
      supabase: first.supabase as never,
    });
    const second = feedSupabase(rows);

    await fetchFeedPage({
      ...options,
      supabase: second.supabase as never,
      cursor: firstPage.nextCursor,
    });

    // Topic matches, primary-author matches, and accepted-coauthor matches are
    // separate post candidate queries before they are merged and de-duped.
    expect(second.postQueries).toHaveLength(3);
    expect(
      second.postQueries.every((query) => query.keysetFilters.length === 1)
    ).toBe(true);
  });

  it("excludes viewer coauthored posts before every subscription source limit", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
    const rows = Array.from({ length: 10 }, (_, index) => ({
      ...rankedRow(index, 0),
      topic_keys: ["climate"],
      subscription_author_credits: [
        {
          user_id: "author-1",
          accepted_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    }));
    const viewerCredits = Array.from({ length: 5 }, (_, index) => ({
      post_id: `p${index}`,
    }));
    const { supabase, postQueries } = feedSupabase(rows, {
      excludedCredits: viewerCredits,
    });

    const page = await fetchFeedPage({
      ...latestOptions,
      tab: "subscriptions",
      supabase: supabase as never,
      pageSize: 2,
      authorSubscriptionIds: ["author-1"],
      topicSubscriptionKeys: ["climate"],
      subscriptionSource: "all",
    });

    expect(page.posts.map((post) => post.id)).toEqual(["p5", "p6"]);
    expect(page.hasMore).toBe(true);
    expect(postQueries).toHaveLength(3);
    expect(
      postQueries.every((query) =>
        query.notFilters.some(
          (filter) =>
            filter.column === "id" &&
            filter.operator === "in" &&
            filter.value === "(p0,p1,p2,p3,p4)"
        )
      )
    ).toBe(true);
  });

  it("propagates viewer coauthor exclusion query errors", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
    const { supabase } = feedSupabase([rankedRow(0, 0)], {
      excludedCreditsError: {
        code: "42501",
        message: "viewer credits denied",
      },
    });

    await expect(
      fetchFeedPage({
        ...latestOptions,
        tab: "subscriptions",
        supabase: supabase as never,
        authorSubscriptionIds: ["author-1"],
        subscriptionSource: "authors",
      })
    ).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load posts credited to excluded authors",
      code: "42501",
    });
  });

  it("orders prolific coauthor matches at the post level before limiting", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
    const rows = Array.from({ length: 40 }, (_, index) => ({
      ...rankedRow(index, 0),
      author_id: `owner-${index}`,
      subscription_author_credits: [
        {
          user_id: "author-1",
          accepted_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    }));
    const options = {
      ...latestOptions,
      tab: "subscriptions" as const,
      pageSize: 2,
      authorSubscriptionIds: ["author-1"],
      subscriptionSource: "authors" as const,
    };

    const first = feedSupabase(rows);
    const firstPage = await fetchFeedPage({
      ...options,
      supabase: first.supabase as never,
    });

    expect(firstPage.posts.map((post) => post.id)).toEqual(["p0", "p1"]);
    expect(firstPage.posts[0].subscription_match?.authorIds).toEqual([
      "author-1",
    ]);
    expect(firstPage.hasMore).toBe(true);
    const coauthorQuery = first.postQueries.find((query) =>
      query.select?.includes(
        "subscription_author_credits:post_authors!inner"
      )
    );
    expect(coauthorQuery).toMatchObject({ limit: 5 });
    expect(coauthorQuery?.inFilters).toContainEqual({
      column: "subscription_author_credits.user_id",
      values: ["author-1"],
    });
    expect(
      first.supabase.from.mock.calls.filter(([table]) => table === "post_authors")
    ).toHaveLength(2);

    const second = feedSupabase(rows);
    const secondPage = await fetchFeedPage({
      ...options,
      supabase: second.supabase as never,
      cursor: firstPage.nextCursor,
    });

    expect(secondPage.posts.map((post) => post.id)).toEqual(["p2", "p3"]);
    const secondCoauthorQuery = second.postQueries.find((query) =>
      query.select?.includes(
        "subscription_author_credits:post_authors!inner"
      )
    );
    expect(secondCoauthorQuery?.keysetFilters).toHaveLength(1);
  });
});

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
