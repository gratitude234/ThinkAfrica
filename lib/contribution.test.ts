import { describe, expect, it } from "vitest";
import {
  deservesCloudDraft,
  isAbandonedScrap,
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

describe("what earns a database row", () => {
  const body = (content: string) => ({ ...empty, content: `<p>${content}</p>` });

  it("refuses a stray keystroke, which is how a drafts list fills with junk", () => {
    expect(deservesCloudDraft(empty)).toBe(false);
    expect(deservesCloudDraft(body("G"))).toBe(false);
    expect(deservesCloudDraft(body("Ghhbh"))).toBe(false);
    expect(deservesCloudDraft(body("Ndldjdjdidj"))).toBe(false);
  });

  it("accepts about a sentence of real writing", () => {
    expect(deservesCloudDraft(body("Solar microgrids are changing Jos."))).toBe(true);
    expect(deservesCloudDraft(body("one two three four five"))).toBe(true);
  });

  it("accepts any deliberate act, however short the body", () => {
    expect(deservesCloudDraft({ ...empty, title: "A title" })).toBe(true);
    expect(deservesCloudDraft({ ...empty, tags: ["energy"] })).toBe(true);
    expect(deservesCloudDraft({ ...empty, coverImageUrl: "https://example.com/a.jpg" })).toBe(true);
  });

  it("still treats a single character as worth keeping on the device", () => {
    // The two bars are deliberately different: nothing should ever be lost,
    // but not everything deserves a row.
    expect(hasMeaningfulContribution(body("G"))).toBe(true);
    expect(deservesCloudDraft(body("G"))).toBe(false);
  });
});

describe("abandoned scraps", () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("counts an untitled, barely-written, long-untouched draft", () => {
    expect(isAbandonedScrap({ title: null, word_count: 2, updated_at: daysAgo(30) })).toBe(true);
  });

  it("spares anything the writer named", () => {
    expect(isAbandonedScrap({ title: "Named but tiny", word_count: 1, updated_at: daysAgo(60) })).toBe(false);
  });

  it("spares real writing and anything touched this week", () => {
    expect(isAbandonedScrap({ title: null, word_count: 800, updated_at: daysAgo(60) })).toBe(false);
    expect(isAbandonedScrap({ title: null, word_count: 1, updated_at: daysAgo(2) })).toBe(false);
  });
})
