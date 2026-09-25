import { describe, expect, it } from "vitest";
import {
  deservesCloudDraft,
  isAbandonedScrap,
  deriveContributionExcerpt,
  derivePresentationClassification,
  hasMeaningfulContribution,
  isWrittenExcerpt,
  type ContributionSnapshot,
} from "./contribution";

const empty: ContributionSnapshot = {
  title: "",
  content: "",
  excerpt: "",
  tags: [],
  coverImageUrl: "",
  references: [],
};

describe("universal contribution model", () => {
  it("derives presentation from title presence without a writer-selected mode", () => {
    // content_kind alone. The legacy type and the genre it used to dual-write
    // are derived and nulled by the database now (20260915000006), so writing
    // them here would be a second place that could disagree.
    expect(derivePresentationClassification("   ")).toEqual({
      title: null,
      content_kind: "post",
    });
    expect(derivePresentationClassification(" A longer thought ")).toEqual({
      title: "A longer thought",
      content_kind: "article",
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

describe("isWrittenExcerpt", () => {
  const body =
    "<p>Solar microgrids are changing <strong>Jos</strong>. Here is how the first ones were paid for.</p>";

  it("recognises the opening of the body as generated", () => {
    expect(isWrittenExcerpt(deriveContributionExcerpt(body), body)).toBe(false);
    // Cut short, it ends in an ellipsis and is still the opening.
    expect(isWrittenExcerpt(deriveContributionExcerpt(body, 30), body)).toBe(false);
  });

  it("recognises the older generator's three-dot cut", () => {
    expect(isWrittenExcerpt("Solar microgrids are changing Jos. Here is...", body)).toBe(false);
  });

  it("keeps a summary the writer wrote", () => {
    expect(isWrittenExcerpt("How a city paid for its first solar microgrids", body)).toBe(true);
  });

  it("treats a missing or blank summary as not written", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(isWrittenExcerpt(blank, body), String(blank)).toBe(false);
    }
  });

  it("compares text, not markup or entities", () => {
    const quoted = "<p>Tom &amp; Jerry&#39;s <em>last</em> stand.</p>";

    expect(isWrittenExcerpt("Tom & Jerry's last stand.", quoted)).toBe(false);
  });
});
