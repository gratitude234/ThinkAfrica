import { describe, expect, it, vi } from "vitest";
import { applyPostFilters, normalizeFeedContentFilter } from "./feedData";

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
