import { describe, expect, it } from "vitest";
import type { ArticleFormat, ContentKind, LegacyPostType } from "@/lib/contentModel";
import {
  articleFormatFromLegacyType,
  contentKindFromLegacyType,
  contentKindIsFormalPublication,
  contentKindPublishesImmediately,
  contentKindRequiresFormalReview,
  contentKindRequiresTitle,
  getArticleFormatLabel,
  getContentKindLabel,
  isArticleFormat,
  isContentKind,
  isFormallyReviewed,
  isLegacyPostType,
  parseArticleFormat,
  parseContentKind,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";

describe("legacy mapping", () => {
  it("maps blog to post", () => {
    expect(contentKindFromLegacyType("blog")).toBe("post");
    expect(articleFormatFromLegacyType("blog")).toBeNull();
  });

  it("maps essay to article/essay", () => {
    expect(contentKindFromLegacyType("essay")).toBe("article");
    expect(articleFormatFromLegacyType("essay")).toBe("essay");
  });

  it("maps policy_brief to article/policy_brief", () => {
    expect(contentKindFromLegacyType("policy_brief")).toBe("article");
    expect(articleFormatFromLegacyType("policy_brief")).toBe("policy_brief");
  });

  it("maps research to research", () => {
    expect(contentKindFromLegacyType("research")).toBe("research");
    expect(articleFormatFromLegacyType("research")).toBeNull();
  });
});

describe("resolveContentKind / resolveArticleFormat", () => {
  it("falls back to legacy type when content_kind is absent", () => {
    expect(resolveContentKind({ type: "essay" })).toBe("article");
    expect(resolveArticleFormat({ type: "essay" })).toBe("essay");
  });

  it("prefers an explicit content_kind over the legacy type", () => {
    expect(resolveContentKind({ content_kind: "post", type: "essay" })).toBe("post");
  });

  it("prefers an explicit article_format over the legacy type", () => {
    expect(
      resolveArticleFormat({ content_kind: "article", article_format: "policy_brief", type: "essay" })
    ).toBe("policy_brief");
  });

  it("preserves the policy_brief genre distinctly from essay under the shared article kind", () => {
    const policyBrief = { type: "policy_brief" };
    const essay = { type: "essay" };

    expect(resolveContentKind(policyBrief)).toBe("article");
    expect(resolveContentKind(essay)).toBe("article");
    expect(resolveArticleFormat(policyBrief)).toBe("policy_brief");
    expect(resolveArticleFormat(essay)).toBe("essay");
    expect(resolveArticleFormat(policyBrief)).not.toBe(resolveArticleFormat(essay));
  });

  it("never returns an article_format when the resolved kind isn't article", () => {
    expect(resolveArticleFormat({ content_kind: "post", article_format: "essay" })).toBeNull();
    expect(resolveArticleFormat({ type: "research" })).toBeNull();
  });

  it("resolves to null, not a crash, for null/unknown values", () => {
    expect(resolveContentKind({ type: null })).toBeNull();
    expect(resolveContentKind({ type: undefined })).toBeNull();
    expect(resolveContentKind({ type: "op_ed" })).toBeNull();
    expect(resolveContentKind({ content_kind: "op_ed", type: null })).toBeNull();
    expect(resolveArticleFormat({ type: "op_ed" })).toBeNull();
  });
});

describe("runtime guards", () => {
  it("validates content kinds", () => {
    expect(isContentKind("post")).toBe(true);
    expect(isContentKind("article")).toBe(true);
    expect(isContentKind("research")).toBe(true);
    expect(isContentKind("blog")).toBe(false);
    expect(isContentKind(null)).toBe(false);
    expect(isContentKind(undefined)).toBe(false);
    expect(isContentKind(42)).toBe(false);
  });

  it("validates article formats", () => {
    expect(isArticleFormat("essay")).toBe(true);
    expect(isArticleFormat("policy_brief")).toBe(true);
    expect(isArticleFormat("research")).toBe(false);
    expect(isArticleFormat(null)).toBe(false);
  });

  it("validates legacy post types", () => {
    expect(isLegacyPostType("blog")).toBe(true);
    expect(isLegacyPostType("research")).toBe(true);
    expect(isLegacyPostType("post")).toBe(false);
    expect(isLegacyPostType(null)).toBe(false);
  });

  it("parses untrusted query-string-shaped input safely", () => {
    expect(parseContentKind("article")).toBe("article");
    expect(parseContentKind("essay")).toBeNull();
    expect(parseContentKind(["article"])).toBeNull();
    expect(parseContentKind(undefined)).toBeNull();

    expect(parseArticleFormat("essay")).toBe("essay");
    expect(parseArticleFormat("article")).toBeNull();
  });
});

describe("labels fail safe", () => {
  it("returns a generic label instead of crashing on unknown/null kinds", () => {
    expect(getContentKindLabel("post")).toBe("Post");
    expect(getContentKindLabel(null)).toBe("Content");
    expect(getContentKindLabel(undefined)).toBe("Content");
  });

  it("returns null instead of crashing on unknown/null formats", () => {
    expect(getArticleFormatLabel("essay")).toBe("Essay");
    expect(getArticleFormatLabel(null)).toBeNull();
    expect(getArticleFormatLabel(undefined)).toBeNull();
  });
});

describe("behavioural rules", () => {
  it("title requirements", () => {
    expect(contentKindRequiresTitle("post")).toBe(false);
    expect(contentKindRequiresTitle("article")).toBe(true);
    expect(contentKindRequiresTitle("research")).toBe(true);
    expect(contentKindRequiresTitle(null)).toBe(true);
  });

  it("immediate-publishing rules", () => {
    expect(contentKindPublishesImmediately("post")).toBe(true);
    expect(contentKindPublishesImmediately("article")).toBe(true);
    expect(contentKindPublishesImmediately("research")).toBe(false);
    expect(contentKindPublishesImmediately(null)).toBe(false);
  });

  it("formal-review rules", () => {
    expect(contentKindRequiresFormalReview("post")).toBe(false);
    expect(contentKindRequiresFormalReview("article")).toBe(false);
    expect(contentKindRequiresFormalReview("research")).toBe(true);
    expect(contentKindRequiresFormalReview(undefined)).toBe(true);
  });

  it("formal-publication placement", () => {
    expect(contentKindIsFormalPublication("post")).toBe(false);
    expect(contentKindIsFormalPublication("article")).toBe(false);
    expect(contentKindIsFormalPublication("research")).toBe(true);
    expect(contentKindIsFormalPublication(null)).toBe(false);
  });
});

describe("review status is evidence-based, never name-based", () => {
  it("does not consider a record reviewed merely because its kind is research", () => {
    expect(contentKindRequiresFormalReview("research")).toBe(true);
    expect(isFormallyReviewed({ citation_id: null, published_version_id: null })).toBe(false);
    expect(isFormallyReviewed({})).toBe(false);
  });

  it("considers a record reviewed once workflow evidence exists, regardless of kind", () => {
    expect(isFormallyReviewed({ citation_id: "IND-2026-000123" })).toBe(true);
    expect(isFormallyReviewed({ published_version_id: "11111111-1111-1111-1111-111111111111" })).toBe(
      true
    );
  });

  it("no content kind is treated as reviewed by name alone", () => {
    const kinds: ContentKind[] = ["post", "article", "research"];
    for (const kind of kinds) {
      // Requiring review (a workflow policy) is not the same as having been
      // reviewed (a fact about a specific record). Evidence-free records of
      // every kind must resolve to "not reviewed".
      const evidenceFreeRecord: { content_kind: ContentKind; citation_id: null; published_version_id: null } = {
        content_kind: kind,
        citation_id: null,
        published_version_id: null,
      };
      expect(isFormallyReviewed(evidenceFreeRecord)).toBe(false);
    }
  });
});

describe("posts_sync_content_classification trigger logic (ported from SQL for testability)", () => {
  // Pure JS port of the sync_post_content_classification() trigger defined
  // in supabase/migrations/20260717000001_content_model_phase1.sql. This
  // repo has no local Postgres harness to execute the real trigger, so this
  // port lets its branching logic run under `npm run test`. Keep this in
  // sync with the SQL if the trigger ever changes.
  type Row = {
    type: LegacyPostType;
    content_kind: ContentKind | null;
    article_format: ArticleFormat | null;
  };

  function deriveFromType(type: LegacyPostType) {
    return {
      content_kind: contentKindFromLegacyType(type),
      article_format: articleFormatFromLegacyType(type),
    };
  }

  function simulateInsert(row: Row): Row {
    if (row.content_kind === null) {
      return { ...row, ...deriveFromType(row.type) };
    }
    return row;
  }

  // Postgres compares NEW to OLD; it cannot detect whether a column was
  // syntactically referenced in the statement's SET clause. So "unchanged"
  // here means "resulting value equals the previous value", matching the
  // trigger's own IS NOT DISTINCT FROM OLD checks.
  function simulateUpdate(oldRow: Row, patch: Partial<Row>): Row {
    const newRow: Row = { ...oldRow, ...patch };
    const typeChanged = newRow.type !== oldRow.type;
    const contentKindUnchanged = newRow.content_kind === oldRow.content_kind;
    const articleFormatUnchanged = newRow.article_format === oldRow.article_format;

    if (typeChanged && contentKindUnchanged && articleFormatUnchanged) {
      return { ...newRow, ...deriveFromType(newRow.type) };
    }
    return newRow;
  }

  // Mirrors posts_legacy_type_content_kind_check: content_kind, when set,
  // must agree with what the legacy `type` maps to.
  function violatesLegacyConsistency(row: Pick<Row, "type" | "content_kind">): boolean {
    if (row.content_kind === null) return false;
    return row.content_kind !== contentKindFromLegacyType(row.type);
  }

  it("1. legacy insert derives both columns for every legacy type", () => {
    for (const type of ["blog", "essay", "policy_brief", "research"] as LegacyPostType[]) {
      const inserted = simulateInsert({ type, content_kind: null, article_format: null });
      expect(inserted.content_kind).toBe(contentKindFromLegacyType(type));
      expect(inserted.article_format).toBe(articleFormatFromLegacyType(type));
    }
  });

  it("2. essay -> blog via a type-only update clears the stale article_format", () => {
    const existing: Row = { type: "essay", content_kind: "article", article_format: "essay" };
    const updated = simulateUpdate(existing, { type: "blog" });
    expect(updated.content_kind).toBe("post");
    expect(updated.article_format).toBeNull();
  });

  it("3. policy_brief -> research via a type-only update", () => {
    const existing: Row = { type: "policy_brief", content_kind: "article", article_format: "policy_brief" };
    const updated = simulateUpdate(existing, { type: "research" });
    expect(updated.content_kind).toBe("research");
    expect(updated.article_format).toBeNull();
  });

  it("4. blog -> policy_brief via a type-only update", () => {
    const existing: Row = { type: "blog", content_kind: "post", article_format: null };
    const updated = simulateUpdate(existing, { type: "policy_brief" });
    expect(updated.content_kind).toBe("article");
    expect(updated.article_format).toBe("policy_brief");
  });

  it("5. explicit generic article with article_format=null is preserved on insert", () => {
    const inserted = simulateInsert({ type: "essay", content_kind: "article", article_format: null });
    expect(inserted.content_kind).toBe("article");
    expect(inserted.article_format).toBeNull();
  });

  it("6. an explicit invalid combination is left for the CHECK constraints to reject", () => {
    const inserted = simulateInsert({ type: "essay", content_kind: "post", article_format: "essay" });
    // The trigger leaves this untouched because content_kind was supplied.
    // Two database constraints then reject it: article_format='essay' with
    // content_kind != 'article' violates
    // posts_article_format_requires_article_check, and content_kind='post'
    // with type='essay' (which maps to 'article') violates
    // posts_legacy_type_content_kind_check.
    expect(inserted).toEqual({ type: "essay", content_kind: "post", article_format: "essay" });
    const violatesFormatConstraint =
      inserted.article_format !== null && inserted.content_kind !== "article";
    expect(violatesFormatConstraint).toBe(true);
    expect(violatesLegacyConsistency(inserted)).toBe(true);
  });

  it("does not resync an explicit dual-write that changes type and both new columns together", () => {
    const existing: Row = { type: "essay", content_kind: "article", article_format: "essay" };
    const updated = simulateUpdate(existing, {
      type: "policy_brief",
      content_kind: "article",
      article_format: "policy_brief",
    });
    expect(updated).toEqual({ type: "policy_brief", content_kind: "article", article_format: "policy_brief" });
  });

  it("preserves an explicit article_format correction that leaves type and content_kind unchanged", () => {
    // A formatted essay being turned into a generic article: content_kind
    // stays 'article' (still consistent with type='essay'), only
    // article_format changes. type doesn't change, so the trigger's update
    // branch never fires regardless of what else is in the statement.
    const existing: Row = { type: "essay", content_kind: "article", article_format: "essay" };
    const updated = simulateUpdate(existing, { article_format: null });
    expect(updated).toEqual({ type: "essay", content_kind: "article", article_format: null });
    expect(violatesLegacyConsistency(updated)).toBe(false);
  });
});

describe("posts_legacy_type_content_kind_check (consistency guard)", () => {
  // Mirrors the CHECK constraint added alongside the sync trigger: type
  // and content_kind must not disagree about what a post fundamentally is.
  function violatesLegacyConsistency(row: { type: LegacyPostType; content_kind: ContentKind | null }): boolean {
    if (row.content_kind === null) return false;
    return row.content_kind !== contentKindFromLegacyType(row.type);
  }

  it("passes for every legacy type paired with its mapped content_kind", () => {
    const pairs: Array<[LegacyPostType, ContentKind]> = [
      ["blog", "post"],
      ["essay", "article"],
      ["policy_brief", "article"],
      ["research", "research"],
    ];
    for (const [type, content_kind] of pairs) {
      expect(violatesLegacyConsistency({ type, content_kind })).toBe(false);
    }
  });

  it("rejects type='blog' paired with content_kind='research'", () => {
    expect(violatesLegacyConsistency({ type: "blog", content_kind: "research" })).toBe(true);
  });

  it("passes a generic article (type='essay', content_kind='article', article_format=null)", () => {
    expect(violatesLegacyConsistency({ type: "essay", content_kind: "article" })).toBe(false);
  });

  it("passes content_kind=null regardless of type, since the column is still optional", () => {
    for (const type of ["blog", "essay", "policy_brief", "research"] as LegacyPostType[]) {
      expect(violatesLegacyConsistency({ type, content_kind: null })).toBe(false);
    }
  });
});
