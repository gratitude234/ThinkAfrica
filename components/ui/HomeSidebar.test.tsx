import { describe, expect, it } from "vitest";
import { draftHref } from "./HomeSidebar";

// "Continue writing" is a known draft, not an ambiguous "Write"/"Create"
// entry point -- it must keep linking straight to the correct editor
// (resolved via content_kind) instead of routing through the shared
// Create chooser.
describe("draftHref (existing-draft resume link bypasses the Create chooser)", () => {
  it("resolves a research draft straight to the research submission flow", () => {
    expect(
      draftHref({ id: "d1", title: "t", updated_at: "2026-01-01", type: "research", content_kind: "research" })
    ).toBe("/submit/research?draft=d1");
  });

  it("resolves a legacy research draft (no content_kind column) the same way", () => {
    expect(draftHref({ id: "d2", title: "t", updated_at: "2026-01-01", type: "research" })).toBe(
      "/submit/research?draft=d2"
    );
  });

  it("resolves an Article/Post draft straight to the Article composer", () => {
    expect(
      draftHref({ id: "d3", title: "t", updated_at: "2026-01-01", type: "essay", content_kind: "article" })
    ).toBe("/write?draft=d3");
    expect(draftHref({ id: "d4", title: "t", updated_at: "2026-01-01", type: "blog" })).toBe(
      "/write?draft=d4"
    );
  });
});
