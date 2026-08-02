import { describe, expect, it, vi } from "vitest";
import { applyPostFilters, fetchResponsePage, normalizeFeedContentFilter } from "./feedData";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

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
