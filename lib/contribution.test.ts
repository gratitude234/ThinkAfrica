import { describe, expect, it } from "vitest";
import {
  deriveContributionExcerpt,
  derivePresentationClassification,
  hasMeaningfulContribution,
  type ContributionSnapshot,
} from "./contribution";

const empty: ContributionSnapshot = {
  title: "",
  content: "",
  excerpt: "",
  tags: [],
  coverImageUrl: "",
  references: [],
  collaborators: [],
  inResponseToId: null,
  promptId: null,
};

describe("universal contribution model", () => {
  it("derives presentation from title presence without a writer-selected mode", () => {
    expect(derivePresentationClassification("   ")).toEqual({
      title: null,
      type: "blog",
      content_kind: "post",
      article_format: null,
    });
    expect(derivePresentationClassification(" A longer thought ")).toEqual({
      title: "A longer thought",
      type: "essay",
      content_kind: "article",
      article_format: null,
    });
  });

  it("treats body-only writing as a meaningful cloud draft", () => {
    expect(hasMeaningfulContribution(empty)).toBe(false);
    expect(hasMeaningfulContribution({ ...empty, content: "<p>Start here.</p>" })).toBe(true);
  });

  it("derives clean preview text from rich content", () => {
    expect(deriveContributionExcerpt("<p>Hello <strong>Africa</strong>.</p>")).toBe("Hello Africa.");
  });
});
