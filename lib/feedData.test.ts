import { describe, expect, it, vi } from "vitest";
import { applyPostFilters } from "./feedData";

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

describe("applyPostFilters (every filter is new-model-column based, Phase 4A)", () => {
  it("filters type=essay by resolved content_kind, so it also matches legacy AND new-model Policy Briefs", () => {
    const { query, calls } = makeQuerySpy();

    applyPostFilters(query, { type: "essay", cutoff: null });

    expect(calls).toContainEqual({ method: "eq", args: ["content_kind", "article"] });
    expect(calls).not.toContainEqual({ method: "eq", args: ["type", "essay"] });
  });

  it("filters type=policy_brief by article_format, not legacy type -- a brand-new Policy-Brief-format Article always dual-writes type='essay' (see legacyTypeForNewContent in lib/contentModel.ts), so filtering by raw type would make it invisible to this chip", () => {
    const { query, calls } = makeQuerySpy();

    applyPostFilters(query, { type: "policy_brief", cutoff: null });

    expect(calls).toContainEqual({ method: "eq", args: ["article_format", "policy_brief"] });
    expect(calls).not.toContainEqual({ method: "eq", args: ["type", "policy_brief"] });
  });

  it("filters type=research and type=blog by resolved content_kind", () => {
    const { query: researchQuery, calls: researchCalls } = makeQuerySpy();
    applyPostFilters(researchQuery, { type: "research", cutoff: null });
    expect(researchCalls).toContainEqual({ method: "eq", args: ["content_kind", "research"] });
    expect(researchCalls).not.toContainEqual({ method: "eq", args: ["type", "research"] });

    const { query: blogQuery, calls: blogCalls } = makeQuerySpy();
    applyPostFilters(blogQuery, { type: "blog", cutoff: null });
    expect(blogCalls).toContainEqual({ method: "eq", args: ["content_kind", "post"] });
    expect(blogCalls).not.toContainEqual({ method: "eq", args: ["type", "blog"] });
  });

  it("falls back to filtering by exact legacy type for any other value, as a narrower refinement", () => {
    const { query, calls } = makeQuerySpy();

    applyPostFilters(query, { type: "something_else", cutoff: null });

    expect(calls).toContainEqual({ method: "eq", args: ["type", "something_else"] });
  });

  it("applies no type filter for 'all' or null", () => {
    for (const type of ["all", null]) {
      const { query, calls } = makeQuerySpy();

      applyPostFilters(query, { type, cutoff: null });

      expect(calls.filter((c) => c.method === "eq" && c.args[0] !== "status")).toHaveLength(0);
    }
  });
});
