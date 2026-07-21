import { describe, expect, it } from "vitest";
import { getFeedSurfaceReason, getPostQualitySummary, getPublicQualitySignals } from "@/lib/postQuality";

function checklistItem(summary: ReturnType<typeof getPostQualitySummary>, key: string) {
  const item = summary.checklist.find((entry) => entry.key === key);
  if (!item) throw new Error(`Expected a "${key}" checklist item`);
  return item;
}

describe("getPostQualitySummary content-kind awareness", () => {
  it("does not flag a titleless lightweight Post as missing a title", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: null,
      tags: [],
    });

    const titleItem = checklistItem(summary, "title");
    expect(titleItem.done).toBe(true);
    expect(titleItem.blocking).toBe(false);
    expect(summary.missingItems).not.toContain("Clear title");
  });

  it("does not require topics for a lightweight Post", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: null,
      tags: [],
    });

    const tagsItem = checklistItem(summary, "tags");
    expect(tagsItem.done).toBe(true);
    expect(tagsItem.blocking).toBe(false);
    expect(summary.missingItems).not.toContain("Topics selected");
  });

  it("does not flag a short Post's length as missing -- shortness is intentional", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: null,
      tags: [],
      content: "A few words only.",
      wordCount: 4,
    });

    const wordCountItem = checklistItem(summary, "word_count");
    expect(wordCountItem.done).toBe(true);
    expect(wordCountItem.blocking).toBe(false);
    expect(summary.missingItems).not.toContain("Quick Take length");
  });

  it("still flags a short legacy Blog's length (Quick-Take length still applies to titled Blogs)", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: "My old blog post",
      tags: ["policy"],
      content: "A few words only.",
      wordCount: 4,
    });

    const wordCountItem = checklistItem(summary, "word_count");
    expect(wordCountItem.done).toBe(false);
    expect(summary.missingItems).toContain("Quick Take length");
  });

  it("lets a titleless, tagless Post be ready for submission", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: null,
      tags: [],
    });

    expect(summary.readyForSubmission).toBe(true);
  });

  it("labels a genuinely titleless record as 'Post', not 'Blog'/'Quick Take'", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: null,
      tags: [],
    });

    expect(summary.contentLabel).toBe("Post");
  });

  it("still requires a title for an essay/policy_brief/research", () => {
    for (const type of ["essay", "policy_brief", "research"]) {
      const summary = getPostQualitySummary({
        type,
        status: "draft",
        title: null,
        tags: ["policy"],
      });

      const titleItem = checklistItem(summary, "title");
      expect(titleItem.done).toBe(false);
      expect(titleItem.blocking).toBe(true);
      expect(summary.missingItems).toContain("Clear title");
    }
  });

  it("still requires topics for an essay/policy_brief/research", () => {
    const summary = getPostQualitySummary({
      type: "essay",
      status: "draft",
      title: "An essay",
      tags: [],
    });

    const tagsItem = checklistItem(summary, "tags");
    expect(tagsItem.done).toBe(false);
    expect(tagsItem.blocking).toBe(true);
  });

  it("keeps a legacy titled Blog's existing label instead of relabeling it 'Post'", () => {
    const summary = getPostQualitySummary({
      type: "blog",
      content_kind: "post",
      status: "published",
      title: "My old blog post",
      tags: [],
      wordCount: 500,
    });

    expect(summary.contentLabel).not.toBe("Post");
  });

  it("falls back to legacy type mapping when content_kind is absent", () => {
    // blog -> post kind, purely from `type`, with no content_kind supplied.
    const summary = getPostQualitySummary({
      type: "blog",
      status: "published",
      title: null,
      tags: [],
    });

    expect(checklistItem(summary, "title").done).toBe(true);
    expect(checklistItem(summary, "tags").done).toBe(true);
  });
});

describe("getPostQualitySummary contentLabel is content-kind aware", () => {
  it("labels a brand-new generic Article as 'Article', not 'Essay'", () => {
    const summary = getPostQualitySummary({
      type: "essay",
      content_kind: "article",
      article_format: null,
      status: "draft",
      title: "A real title",
      tags: ["policy"],
      wordCount: 900,
    });

    expect(summary.contentLabel).toBe("Article");
  });

  it("labels a legacy Essay as 'Article · Essay'", () => {
    const summary = getPostQualitySummary({
      type: "essay",
      content_kind: "article",
      article_format: "essay",
      status: "draft",
      title: "A real title",
      tags: ["policy"],
      wordCount: 900,
    });

    expect(summary.contentLabel).toBe("Article · Essay");
  });

  it("labels a legacy Policy Brief as 'Article · Policy Brief'", () => {
    const summary = getPostQualitySummary({
      type: "policy_brief",
      content_kind: "article",
      article_format: "policy_brief",
      status: "draft",
      title: "A real title",
      tags: ["policy"],
      wordCount: 900,
    });

    expect(summary.contentLabel).toBe("Article · Policy Brief");
  });

  it("falls back to legacy-type inference when content_kind/article_format are entirely absent", () => {
    const summary = getPostQualitySummary({
      type: "policy_brief",
      status: "draft",
      title: "A real title",
      tags: ["policy"],
      wordCount: 900,
    });

    expect(summary.contentLabel).toBe("Article · Policy Brief");
  });
});

describe("public quality signals are evidence-based, not name-based", () => {
  it("does not badge a policy_brief as Reviewed merely by type, with no completion evidence", () => {
    const signals = getPublicQualitySignals({ type: "policy_brief", citationId: null, publishedVersionId: null });

    expect(signals.badges.map((badge) => badge.key)).not.toContain("reviewed");
  });

  it("badges Reviewed once a publishedVersionId exists, regardless of type", () => {
    const signals = getPublicQualitySignals({
      type: "policy_brief",
      citationId: null,
      publishedVersionId: "11111111-1111-1111-1111-111111111111",
    });

    expect(signals.badges.map((badge) => badge.key)).toContain("reviewed");
  });

  it("badges Reviewed once a citationId exists", () => {
    const signals = getPublicQualitySignals({ type: "research", citationId: "IND-2026-000123" });

    expect(signals.badges.map((badge) => badge.key)).toContain("reviewed");
  });

  it("does not surface 'Reviewed or citable work' as a feed reason without evidence", () => {
    const reason = getFeedSurfaceReason({ type: "research", citationId: null, publishedVersionId: null });

    expect(reason).not.toBe("Reviewed or citable work");
  });

  it("surfaces 'Reviewed or citable work' once evidence exists", () => {
    const reason = getFeedSurfaceReason({
      type: "policy_brief",
      citationId: null,
      publishedVersionId: "11111111-1111-1111-1111-111111111111",
    });

    expect(reason).toBe("Reviewed or citable work");
  });

  it("gives an unreviewed policy_brief a lower quality score than an equivalent reviewed one", () => {
    const unreviewed = getPublicQualitySignals({ type: "policy_brief", citationId: null, publishedVersionId: null })
      .score;
    const reviewed = getPublicQualitySignals({
      type: "policy_brief",
      citationId: null,
      publishedVersionId: "11111111-1111-1111-1111-111111111111",
    }).score;

    expect(reviewed).toBeGreaterThan(unreviewed);
  });
});
