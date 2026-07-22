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
  isLegacyPolicyBriefInFlight,
  isLegacyPostType,
  legacyTypeForNewContent,
  needsEditorialWorkflow,
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

describe("Phase 4A: isLegacyPolicyBriefInFlight / needsEditorialWorkflow (three concepts stay separate)", () => {
  // "Requires review by product policy", "already entered a legacy review
  // workflow", and "has completed formal review" must never collapse into
  // one boolean -- see the doc comment above needsEditorialWorkflow() in
  // lib/contentModel.ts.

  it("a new Policy-Brief-format Article never counts as legacy-in-flight -- its legacy type is 'essay', never 'policy_brief'", () => {
    expect(
      isLegacyPolicyBriefInFlight({ type: "essay", status: "pending" })
    ).toBe(false);
    expect(
      isLegacyPolicyBriefInFlight({ type: "essay", status: "pending_revision" })
    ).toBe(false);
  });

  it("an existing pending/pending_revision legacy Policy Brief retains temporary workflow compatibility", () => {
    expect(isLegacyPolicyBriefInFlight({ type: "policy_brief", status: "pending" })).toBe(true);
    expect(
      isLegacyPolicyBriefInFlight({ type: "policy_brief", status: "pending_revision" })
    ).toBe(true);
  });

  it("is scoped to the two in-flight statuses only -- draft/published/rejected/removed/withdrawn are not 'in flight'", () => {
    for (const status of ["draft", "published", "rejected", "removed", "withdrawn"]) {
      expect(isLegacyPolicyBriefInFlight({ type: "policy_brief", status })).toBe(false);
    }
  });

  it("needsEditorialWorkflow: a new-model Research submission always needs workflow, by product policy alone", () => {
    expect(
      needsEditorialWorkflow({ type: "research", content_kind: "research", status: "draft" })
    ).toBe(true);
  });

  it("needsEditorialWorkflow: a new Policy-Brief-format Article never needs workflow -- genre alone never triggers review", () => {
    expect(
      needsEditorialWorkflow({ type: "essay", content_kind: "article", status: "draft" })
    ).toBe(false);
    expect(
      needsEditorialWorkflow({ type: "essay", content_kind: "article", status: "published" })
    ).toBe(false);
  });

  it("needsEditorialWorkflow: a legacy pending Policy Brief needs workflow through the compatibility path, not product policy", () => {
    // contentKindRequiresFormalReview alone would say false (content_kind
    // resolves to "article"); it's isLegacyPolicyBriefInFlight that makes
    // this true, and only while it's actually pending.
    expect(contentKindRequiresFormalReview(resolveContentKind({ type: "policy_brief" }))).toBe(false);
    expect(needsEditorialWorkflow({ type: "policy_brief", status: "pending" })).toBe(true);
  });

  it("needsEditorialWorkflow: an accepted (published) legacy Policy Brief no longer needs workflow -- it's done, not in flight", () => {
    expect(needsEditorialWorkflow({ type: "policy_brief", status: "published" })).toBe(false);
  });

  it("has-completed-review stays independent of needs-workflow in both directions", () => {
    // Needs workflow, hasn't completed it.
    expect(needsEditorialWorkflow({ type: "research", status: "pending" })).toBe(true);
    expect(isFormallyReviewed({ citation_id: null, published_version_id: null })).toBe(false);

    // Doesn't need workflow (Article genre), but nothing stops it from
    // carrying no evidence either -- the two facts are unrelated.
    expect(needsEditorialWorkflow({ type: "essay", content_kind: "article", status: "published" })).toBe(
      false
    );
    expect(isFormallyReviewed({ citation_id: null, published_version_id: null })).toBe(false);
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

describe("legacyTypeForNewContent (Phase 3 dual-write mapping for new records)", () => {
  it("maps a new Post to the legacy 'blog' value", () => {
    expect(legacyTypeForNewContent("post")).toBe("blog");
  });

  it("maps a new Article to the legacy 'essay' value", () => {
    expect(legacyTypeForNewContent("article")).toBe("essay");
  });

  it("fails safe: returns null for research instead of guessing, since research has its own submission flow", () => {
    expect(legacyTypeForNewContent("research")).toBeNull();
  });

  it("the resulting legacy value round-trips back to the same content_kind", () => {
    for (const kind of ["post", "article"] as ContentKind[]) {
      const legacyType = legacyTypeForNewContent(kind);
      expect(contentKindFromLegacyType(legacyType)).toBe(kind);
    }
  });

  it("a brand-new generic Article's dual-write is internally consistent with a null article_format", () => {
    const legacyType = legacyTypeForNewContent("article");
    expect(resolveContentKind({ type: legacyType, content_kind: "article" })).toBe("article");
    expect(
      resolveArticleFormat({ type: legacyType, content_kind: "article", article_format: null })
    ).toBeNull();
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

describe("guard_locked_post_write trigger logic (ported from SQL for testability)", () => {
  // Pure JS port of the trigger defined in
  // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql.
  // This repo has no local Postgres harness to execute the real trigger
  // (see the equivalent note on the Phase 1 sync trigger above), so this
  // port lets its branching logic run under `npm run test`. Keep this in
  // sync with the SQL if the trigger ever changes.
  //
  // This replaces earlier, flawed ports (and the trigger they mirrored):
  //   - The first only ever inspected OLD.status/OLD.type on UPDATE, which
  //     meant it did nothing to stop an authenticated write from
  //     *becoming* formally-published/citable -- an INSERT already marked
  //     published, a pending->published UPDATE, or reclassifying a
  //     published Article's `type` into research/policy_brief. Rewritten
  //     to check NEW instead.
  //   - The second only covered INSERT/UPDATE. "Authors can delete their
  //     own posts" has no status restriction, and post_versions/
  //     post_references/post_authors all cascade-delete with their parent
  //     post, so an author could delete an accepted paper's entire
  //     editorial record outright. Rewritten to also guard DELETE.
  //   - The third added 'withdrawn' to posts_status_check but left the
  //     transition into it, and out of it, entirely unenforced here -- the
  //     only precondition (pending/pending_revision only) lived in the
  //     'authenticated'-role withdrawSubmission() server action, with no
  //     DB-level backstop. A direct write could set a draft/rejected post
  //     straight to 'withdrawn', flip a withdrawn submission back to
  //     'pending', or (since is_post_editable() didn't count it as locked)
  //     still edit a withdrawn submission's references/co-authors.
  //     Rewritten so the transition is validated here too, and 'withdrawn'
  //     is terminal like 'removed'.
  //   - Phase 4A (supabase/migrations/20260722000001_content_model_phase4a_cutover_prep.sql)
  //     replaced every `type IN ('research', 'policy_brief')` predicate
  //     with an effective-content-kind-aware one (content_kind first,
  //     `type` fallback, OR'd with the literal legacy type='policy_brief'
  //     value) so a brand-new Policy-Brief-*format* Article -- whose
  //     `type` is always "essay", never "policy_brief" (see
  //     legacyTypeForNewContent() in lib/contentModel.ts) -- is never
  //     wrongly locked/gated just because of its genre, while an actual
  //     legacy Policy Brief (raw type="policy_brief") keeps exactly the
  //     same protection it always had, whatever its content_kind/
  //     article_format columns say.
  type PostRow = {
    status: string;
    type: string;
    content_kind?: string | null;
    article_format?: string | null;
    citation_id: string | null;
    published_version_id: string | null;
  };

  // Mirrors public.effective_content_kind() (SQL) / resolveContentKind()
  // (lib/contentModel.ts): prefers a valid content_kind, falls back to
  // mapping legacy `type`.
  function effectiveContentKind(row: PostRow): string | null {
    if (row.content_kind === "post" || row.content_kind === "article" || row.content_kind === "research") {
      return row.content_kind;
    }
    if (row.type === "blog") return "post";
    if (row.type === "essay" || row.type === "policy_brief") return "article";
    if (row.type === "research") return "research";
    return null;
  }

  // Mirrors the "research OR legacy policy_brief" predicate every
  // Phase 4A guard function below uses -- never article_format, only the
  // literal legacy type value (see the Phase 4A revision note above).
  function isResearchOrLegacyPolicyBrief(row: PostRow): boolean {
    return effectiveContentKind(row) === "research" || row.type === "policy_brief";
  }

  function guardLockedPostWrite(input: {
    role: "service_role" | "authenticated" | "anon" | null;
    // current_user -- what SECURITY DEFINER actually changes. Defaults to
    // `role` (the ordinary, non-SECURITY-DEFINER case, where the executing
    // Postgres role and the JWT role are the same). Pass a different value
    // (e.g. the owning role of withdraw_post_submission()) to model a
    // SECURITY DEFINER function's own writes, where auth.role() still
    // reads the caller's JWT role but current_user does not.
    execRole?: string | null;
    op: "INSERT" | "UPDATE" | "DELETE";
    new?: PostRow;
    old?: PostRow;
  }): { allowed: true } | { allowed: false; message: string } {
    const execRole = input.execRole === undefined ? input.role : input.execRole;
    if (input.role !== "authenticated" || execRole !== "authenticated") {
      return { allowed: true };
    }

    if (input.op === "DELETE") {
      // Product decision: hard-delete is for drafts only. Everything else
      // (pending/pending_revision -- withdraw it instead, published
      // Articles/Posts, rejected, removed, withdrawn) is blocked, not just
      // the two "locked, formally-reviewed" cases the UPDATE branch cares
      // about.
      if (input.old!.status !== "draft") {
        return {
          allowed: false,
          message: "Only drafts can be deleted directly. Withdraw a submission instead of deleting it.",
        };
      }
      return { allowed: true };
    }

    const newRow = input.new!;

    if (newRow.status === "published" && isResearchOrLegacyPolicyBrief(newRow)) {
      return {
        allowed: false,
        message: "Research and policy briefs can only be published by an editor accepting a submission.",
      };
    }

    // Caught in review: the self-publish check above only ever inspects
    // NEW's *resulting* classification. A single authenticated UPDATE that
    // reclassifies a pending research/legacy-policy-brief row away from
    // that classification *and* sets status='published' in the same
    // statement bypassed it entirely. Freeze classification, and restrict
    // status transitions to the author-legitimate subset, for the entire
    // time the row sits in pending/pending_revision.
    if (
      input.op === "UPDATE" &&
      (input.old?.status === "pending" || input.old?.status === "pending_revision") &&
      isResearchOrLegacyPolicyBrief(input.old)
    ) {
      if (
        newRow.type !== input.old.type ||
        (newRow.content_kind ?? null) !== (input.old.content_kind ?? null) ||
        (newRow.article_format ?? null) !== (input.old.article_format ?? null)
      ) {
        return {
          allowed: false,
          message: "A submission awaiting review or in revision cannot change its classification.",
        };
      }

      // Withdrawal (-> 'withdrawn') is NOT exempted here. withdraw_post_
      // submission()'s own write never reaches this block at all -- it's
      // exempted by the current_user bypass at the top of this function,
      // since it runs SECURITY DEFINER -- so this block only ever sees a
      // *direct* authenticated write, for which withdrawal is not a
      // legitimate transition to originate outside that RPC. It's rejected
      // here, earlier and with a clearer reason, than by the dedicated
      // withdrawn-transition check further below (which still independently
      // rejects it too, and is what the RPC's own write is validated
      // against in spirit even though it bypasses this trigger entirely).
      if (input.old.status === "pending" && newRow.status !== "pending") {
        return {
          allowed: false,
          message: "A submission awaiting review can only be changed by the editorial decision workflow.",
        };
      }

      if (
        input.old.status === "pending_revision" &&
        newRow.status !== "pending_revision" &&
        newRow.status !== "pending"
      ) {
        return {
          allowed: false,
          message: "A submission in revision can only stay in revision or be resubmitted for review.",
        };
      }
    }

    // Reject any change in either direction (set, clear, or replace), not
    // just introducing a non-null value -- an authenticated write must
    // never be able to clear an existing citation_id/published_version_id
    // back to null either.
    if (input.op === "INSERT") {
      if (newRow.citation_id !== null) {
        return {
          allowed: false,
          message: "citation_id can only be assigned by the editorial acceptance workflow.",
        };
      }
      if (newRow.published_version_id !== null) {
        return {
          allowed: false,
          message: "published_version_id can only be assigned by the editorial acceptance workflow.",
        };
      }
    } else if (input.op === "UPDATE") {
      if (newRow.citation_id !== (input.old?.citation_id ?? null)) {
        return {
          allowed: false,
          message: "citation_id can only be assigned by the editorial acceptance workflow.",
        };
      }
      if (newRow.published_version_id !== (input.old?.published_version_id ?? null)) {
        return {
          allowed: false,
          message: "published_version_id can only be assigned by the editorial acceptance workflow.",
        };
      }
    }

    if (
      input.op === "UPDATE" &&
      input.old?.status === "published" &&
      isResearchOrLegacyPolicyBrief(input.old)
    ) {
      return {
        allowed: false,
        message: "This publication is locked after acceptance and cannot be modified directly.",
      };
    }

    if (newRow.status === "removed" || (input.op === "UPDATE" && input.old?.status === "removed")) {
      return { allowed: false, message: "This post was removed and cannot be modified." };
    }

    if (newRow.status === "withdrawn") {
      if (!isResearchOrLegacyPolicyBrief(newRow)) {
        return {
          allowed: false,
          message: "Only a research paper or policy brief submission can be withdrawn.",
        };
      }
      if (
        input.op === "INSERT" ||
        (input.old?.status !== "pending" && input.old?.status !== "pending_revision")
      ) {
        return {
          allowed: false,
          message: "Only a submission awaiting or in revision can be withdrawn.",
        };
      }
    }

    if (input.op === "UPDATE" && input.old?.status === "withdrawn") {
      return { allowed: false, message: "This submission was withdrawn and cannot be modified." };
    }

    return { allowed: true };
  }

  function row(overrides: Partial<PostRow> = {}): PostRow {
    return { status: "draft", type: "essay", citation_id: null, published_version_id: null, ...overrides };
  }

  it("blocks an authenticated INSERT that arrives already published as research/policy_brief -- self-manufactured publications", () => {
    for (const type of ["research", "policy_brief"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "INSERT",
        new: row({ status: "published", type, citation_id: "FAKE-2026-000001" }),
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks an authenticated UPDATE self-publishing a pending research/policy_brief -- not just already-locked rows", () => {
    for (const type of ["research", "policy_brief"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "pending", type }),
        new: row({ status: "published", type }),
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks reclassifying an already-published Article's type into research/policy_brief", () => {
    const result = guardLockedPostWrite({
      role: "authenticated",
      op: "UPDATE",
      old: row({ status: "published", type: "essay" }),
      new: row({ status: "published", type: "research" }),
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks an authenticated write introducing a citation_id, on insert or update", () => {
    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "INSERT",
        new: row({ citation_id: "FAKE-2026-000001" }),
      }).allowed
    ).toBe(false);

    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ citation_id: null }),
        new: row({ citation_id: "FAKE-2026-000001" }),
      }).allowed
    ).toBe(false);
  });

  it("blocks an authenticated write introducing a published_version_id, on insert or update", () => {
    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "INSERT",
        new: row({ published_version_id: "11111111-1111-1111-1111-111111111111" }),
      }).allowed
    ).toBe(false);

    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ published_version_id: null }),
        new: row({ published_version_id: "11111111-1111-1111-1111-111111111111" }),
      }).allowed
    ).toBe(false);
  });

  it("blocks an authenticated write clearing an existing citation_id/published_version_id back to null", () => {
    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "draft", citation_id: "IND-2026-000001" }),
        new: row({ status: "draft", citation_id: null }),
      }).allowed
    ).toBe(false);

    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "draft", published_version_id: "11111111-1111-1111-1111-111111111111" }),
        new: row({ status: "draft", published_version_id: null }),
      }).allowed
    ).toBe(false);
  });

  it("blocks a direct author update that modifies an already-accepted publication without changing status/type/citation", () => {
    for (const type of ["research", "policy_brief"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "published", type, citation_id: "IND-2026-000001" }),
        new: row({ status: "published", type, citation_id: "IND-2026-000001" }),
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks setting status=removed directly, and blocks any further write to an already-removed row", () => {
    expect(
      guardLockedPostWrite({ role: "authenticated", op: "UPDATE", old: row(), new: row({ status: "removed" }) })
        .allowed
    ).toBe(false);
    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "removed" }),
        new: row({ status: "removed" }),
      }).allowed
    ).toBe(false);
  });

  it("allows the legitimate withdrawal transition when performed by withdraw_post_submission() -- pending/pending_revision research or policy_brief -> withdrawn", () => {
    for (const type of ["research", "policy_brief"]) {
      for (const oldStatus of ["pending", "pending_revision"]) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          // The RPC's own write: auth.role() still reads 'authenticated'
          // (the caller's JWT), but current_user is the function's owner,
          // not 'authenticated' -- see the execRole bypass at the top of
          // guardLockedPostWrite. This is the only way this transition is
          // meant to be reached at all.
          execRole: "postgres",
          op: "UPDATE",
          old: row({ status: oldStatus, type }),
          new: row({ status: "withdrawn", type }),
        });
        expect(result.allowed).toBe(true);
      }
    }
  });

  it("blocks the identical withdrawal transition when attempted as a direct authenticated write instead of through withdraw_post_submission() -- caught by the reclassification-lock's status-transition restriction, on top of RLS and the dedicated withdrawn-transition check", () => {
    for (const type of ["research", "policy_brief"]) {
      for (const oldStatus of ["pending", "pending_revision"]) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          execRole: "authenticated",
          op: "UPDATE",
          old: row({ status: oldStatus, type }),
          new: row({ status: "withdrawn", type }),
        });
        expect(result.allowed).toBe(false);
      }
    }
  });

  it("blocks withdrawing an Article/Post -- only research/policy_brief formal submissions can be withdrawn", () => {
    for (const type of ["essay", "blog"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "pending", type }),
        new: row({ status: "withdrawn", type }),
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks setting status=withdrawn from any state other than pending/pending_revision", () => {
    for (const oldStatus of ["draft", "published", "rejected", "removed"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: oldStatus, type: "research" }),
        new: row({ status: "withdrawn", type: "research" }),
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks an INSERT that arrives already withdrawn -- there is no such thing as a brand-new withdrawn row", () => {
    const result = guardLockedPostWrite({
      role: "authenticated",
      op: "INSERT",
      new: row({ status: "withdrawn", type: "research" }),
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks any further authenticated write to an already-withdrawn row -- withdrawn is terminal, like removed", () => {
    // Including trying to flip it back to pending, which would resurrect a
    // submission outside any real resubmission flow.
    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "withdrawn", type: "research" }),
        new: row({ status: "pending", type: "research" }),
      }).allowed
    ).toBe(false);
    expect(
      guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "withdrawn", type: "research" }),
        new: row({ status: "withdrawn", type: "research" }),
      }).allowed
    ).toBe(false);
  });

  it("always allows a service-role or no-JWT-role write through every withdrawn-related rule", () => {
    for (const role of ["service_role", null] as const) {
      expect(
        guardLockedPostWrite({
          role,
          op: "UPDATE",
          old: row({ status: "draft", type: "essay" }),
          new: row({ status: "withdrawn", type: "essay" }),
        }).allowed
      ).toBe(true);
      expect(
        guardLockedPostWrite({
          role,
          op: "UPDATE",
          old: row({ status: "withdrawn", type: "research" }),
          new: row({ status: "pending", type: "research" }),
        }).allowed
      ).toBe(true);
    }
  });

  it("blocks an authenticated DELETE of anything that isn't a draft -- pending, pending_revision, published, rejected, removed, withdrawn", () => {
    for (const type of ["research", "policy_brief", "essay", "blog"]) {
      for (const status of ["pending", "pending_revision", "published", "rejected", "removed", "withdrawn"]) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          op: "DELETE",
          old: row({ status, type }),
        });
        expect(result.allowed).toBe(false);
      }
    }
  });

  it("allows an authenticated DELETE of a draft, of any type", () => {
    for (const type of ["research", "policy_brief", "essay", "blog"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "DELETE",
        old: row({ status: "draft", type }),
      });
      expect(result.allowed).toBe(true);
    }
  });

  it("always allows a service-role or no-JWT-role DELETE of a non-draft row -- moderation and maintenance paths", () => {
    for (const role of ["service_role", null] as const) {
      const result = guardLockedPostWrite({
        role,
        op: "DELETE",
        old: row({ status: "published", type: "research", citation_id: "IND-2026-000001" }),
      });
      expect(result.allowed).toBe(true);
    }
  });

  it("does not lock a published Article or Post -- those are never formally reviewed", () => {
    for (const type of ["blog", "essay"]) {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ status: "published", type }),
        new: row({ status: "published", type }),
      });
      expect(result.allowed).toBe(true);
    }
  });

  it("allows the ordinary draft/pending/pending_revision lifecycle for research/policy_brief as long as status doesn't jump to published", () => {
    // pending -> pending_revision is deliberately absent: that's an
    // *editorial* decision (recordEditorDecision(), always service role),
    // never something a direct authenticated write may do -- see the
    // "author-legitimate transitions" describe block below.
    const transitions: Array<[string, string]> = [
      ["draft", "draft"],
      ["draft", "pending"],
      ["pending", "pending"],
      ["pending_revision", "pending_revision"],
      ["pending_revision", "pending"],
    ];
    for (const type of ["research", "policy_brief"]) {
      for (const [oldStatus, newStatus] of transitions) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: row({ status: oldStatus, type }),
          new: row({ status: newStatus, type }),
        });
        expect(result.allowed).toBe(true);
      }
    }
  });

  it("allows a brand-new draft insert with no citation/published-version evidence", () => {
    const result = guardLockedPostWrite({ role: "authenticated", op: "INSERT", new: row({ status: "draft" }) });
    expect(result.allowed).toBe(true);
  });

  it("always allows a service-role write, including the real acceptance transition and setting citation_id/published_version_id", () => {
    const result = guardLockedPostWrite({
      role: "service_role",
      op: "UPDATE",
      old: row({ status: "pending", type: "research" }),
      new: row({
        status: "published",
        type: "research",
        citation_id: "IND-2026-000001",
        published_version_id: "11111111-1111-1111-1111-111111111111",
      }),
    });
    expect(result.allowed).toBe(true);
  });

  it("allows a write with no PostgREST JWT role at all -- a Postgres superuser session, a migration script, the SQL editor -- not just service_role", () => {
    const result = guardLockedPostWrite({
      role: null,
      op: "UPDATE",
      old: row({ status: "published", type: "research", citation_id: "IND-2026-000001" }),
      new: row({ status: "published", type: "research", citation_id: "IND-2026-000001" }),
    });
    expect(result.allowed).toBe(true);
  });

  it("bypasses entirely for a SECURITY DEFINER function's own write -- auth.role() still reads 'authenticated' inside withdraw_post_submission(), but current_user is the function's owner, not 'authenticated' -- caught in review as a regression that broke the withdrawal RPC", () => {
    const result = guardLockedPostWrite({
      role: "authenticated",
      execRole: "postgres",
      op: "UPDATE",
      old: row({ status: "pending", type: "research" }),
      new: row({ status: "withdrawn", type: "research" }),
    });
    expect(result.allowed).toBe(true);
  });

  it("still blocks a genuine direct authenticated write -- current_user really is 'authenticated' there, unlike inside a SECURITY DEFINER function", () => {
    const result = guardLockedPostWrite({
      role: "authenticated",
      execRole: "authenticated",
      op: "UPDATE",
      old: row({ status: "withdrawn", type: "research" }),
      new: row({ status: "pending", type: "research" }),
    });
    expect(result.allowed).toBe(false);
  });

  // Phase 4A (supabase/migrations/20260722000001_content_model_phase4a_cutover_prep.sql):
  // the classification predicates above are now effective-content-kind
  // aware rather than raw `type`-only. These tests are the direct JS
  // equivalent of that migration's own "Verified scenarios" comment.
  describe("Phase 4A: effective-classification-aware locking", () => {
    it("never blocks or locks a brand-new Policy-Brief-format Article -- its legacy type is always 'essay', never 'policy_brief'", () => {
      const newPolicyBriefArticle = row({ type: "essay", content_kind: "article" });

      // Self-publish check: direct authenticated write to status='published'
      // is fine for an ordinary Article, genre notwithstanding.
      expect(
        guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: { ...newPolicyBriefArticle, status: "draft" },
          new: { ...newPolicyBriefArticle, status: "published" },
        }).allowed
      ).toBe(true);

      // Already-locked check: a published Policy-Brief-format Article
      // stays editable, like any other Article.
      expect(
        guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: { ...newPolicyBriefArticle, status: "published" },
          new: { ...newPolicyBriefArticle, status: "published", title: "edited" } as PostRow,
        }).allowed
      ).toBe(true);

      // Withdrawn-transition check: never eligible for withdrawal --
      // Articles publish immediately and never reach pending/pending_revision.
      expect(
        guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: { ...newPolicyBriefArticle, status: "pending" },
          new: { ...newPolicyBriefArticle, status: "withdrawn" },
        }).allowed
      ).toBe(false);
    });

    it("keeps blocking/locking a legacy Policy Brief exactly as before, regardless of whether content_kind/article_format have been dual-written", () => {
      for (const contentKind of [undefined, "article"] as const) {
        const legacyPolicyBrief = row({ type: "policy_brief", content_kind: contentKind });

        expect(
          guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: { ...legacyPolicyBrief, status: "pending" },
            new: { ...legacyPolicyBrief, status: "published" },
          }).allowed
        ).toBe(false);

        expect(
          guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: { ...legacyPolicyBrief, status: "published", citation_id: "IND-2026-000001" },
            new: { ...legacyPolicyBrief, status: "published", citation_id: "IND-2026-000001" },
          }).allowed
        ).toBe(false);

        // A direct authenticated write attempting the pending -> withdrawn
        // transition itself (not through withdraw_post_submission()) is
        // now blocked by the author-legitimate-transitions check too, on
        // top of the posts UPDATE policy's WITH CHECK -- see the
        // "author-legitimate transitions while pending/pending_revision"
        // describe block below for the full withdrawal-RPC-still-works
        // coverage (execRole modeling current_user).
        expect(
          guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: { ...legacyPolicyBrief, status: "pending" },
            new: { ...legacyPolicyBrief, status: "withdrawn" },
          }).allowed
        ).toBe(false);
      }
    });

    it("keeps recognizing genuine Research through content_kind alone, even if `type` somehow disagreed", () => {
      // Defensive case: content_kind is authoritative when present, exactly
      // like resolveContentKind()/effective_content_kind().
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ type: "essay", content_kind: "research", status: "pending" }),
        new: row({ type: "essay", content_kind: "research", status: "published" }),
      });
      expect(result.allowed).toBe(false);
    });
  });

  describe("author-legitimate transitions while pending/pending_revision (caught in review: reclassification-to-escape-review bypass)", () => {
    it("BLOCKING regression: reproduces the exact reclassify-and-publish attack against a pending Research submission", () => {
      // A single authenticated UPDATE that reclassifies the row away from
      // research *and* sets status='published' in the same statement used
      // to bypass the self-publish check entirely, since that check only
      // ever inspected NEW's resulting classification.
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ type: "research", content_kind: "research", article_format: null, status: "pending" }),
        new: row({ type: "essay", content_kind: "article", article_format: null, status: "published" }),
      });
      expect(result.allowed).toBe(false);
    });

    it("BLOCKING regression: reproduces the identical attack against a pending legacy Policy Brief", () => {
      const result = guardLockedPostWrite({
        role: "authenticated",
        op: "UPDATE",
        old: row({ type: "policy_brief", content_kind: "article", article_format: "policy_brief", status: "pending_revision" }),
        new: row({ type: "essay", content_kind: "article", article_format: null, status: "published" }),
      });
      expect(result.allowed).toBe(false);
    });

    it("blocks any classification change while pending or pending_revision, even without a status change", () => {
      for (const status of ["pending", "pending_revision"]) {
        expect(
          guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: row({ type: "research", content_kind: "research", status }),
            new: row({ type: "research", content_kind: "article", status }),
          }).allowed
        ).toBe(false);

        expect(
          guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: row({ type: "policy_brief", content_kind: "article", article_format: "policy_brief", status }),
            new: row({ type: "policy_brief", content_kind: "article", article_format: null, status }),
          }).allowed
        ).toBe(false);
      }
    });

    it("blocks a direct authenticated 'pending' -> 'pending_revision' transition -- that is an editorial decision (service role), never an author's own write", () => {
      for (const type of ["research", "policy_brief"]) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: row({ type, status: "pending" }),
          new: row({ type, status: "pending_revision" }),
        });
        expect(result.allowed).toBe(false);
      }
    });

    it("blocks a direct authenticated 'pending_revision' -> anything other than pending_revision/pending", () => {
      for (const type of ["research", "policy_brief"]) {
        for (const status of ["rejected", "removed", "draft"]) {
          const result = guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: row({ type, status: "pending_revision" }),
            new: row({ type, status }),
          });
          expect(result.allowed).toBe(false);
        }
      }
    });

    it("still allows a legitimate resubmission (pending_revision -> pending) with classification unchanged", () => {
      for (const type of ["research", "policy_brief"]) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: row({ type, status: "pending_revision" }),
          new: row({ type, status: "pending" }),
        });
        expect(result.allowed).toBe(true);
      }
    });

    it("still allows a no-op autosave (status and classification both unchanged) while pending or pending_revision", () => {
      for (const type of ["research", "policy_brief"]) {
        for (const status of ["pending", "pending_revision"]) {
          const result = guardLockedPostWrite({
            role: "authenticated",
            op: "UPDATE",
            old: row({ type, status }),
            new: row({ type, status }),
          });
          expect(result.allowed).toBe(true);
        }
      }
    });

    it("withdrawal still works through the SECURITY DEFINER RPC, which bypasses this entire check via current_user", () => {
      const result = guardLockedPostWrite({
        role: "authenticated",
        execRole: "postgres",
        op: "UPDATE",
        old: row({ type: "research", content_kind: "research", status: "pending" }),
        new: row({ type: "research", content_kind: "research", status: "withdrawn" }),
      });
      expect(result.allowed).toBe(true);
    });

    it("does not apply to a draft, published, rejected, removed, or withdrawn row -- only pending/pending_revision are frozen", () => {
      for (const status of ["draft", "published", "rejected", "removed"]) {
        const result = guardLockedPostWrite({
          role: "authenticated",
          op: "UPDATE",
          old: row({ type: "research", content_kind: "research", status }),
          new: row({ type: "essay", content_kind: "article", status }),
        });
        // Some of these are still blocked by *other* guards (already-
        // locked for 'published', removed-lock for 'removed') -- this test
        // only asserts the classification-freeze block itself isn't what's
        // firing for non-pending/pending_revision rows, by checking a
        // status ('draft'/'rejected') that no other guard blocks either.
        if (status === "draft" || status === "rejected") {
          expect(result.allowed).toBe(true);
        }
      }
    });
  });
});

describe("is_post_editable / guard_locked_post_child_write trigger logic (ported from SQL for testability)", () => {
  // Pure JS port of the companion guard on post_references/post_authors in
  // the same migration -- their RLS gates writes on post ownership alone,
  // with no check on the parent post's status.
  //
  // Replaces an earlier, flawed port (and the trigger it mirrored): that
  // version resolved the post to check via
  // COALESCE(NEW.post_id, OLD.post_id), which is NEW.post_id on every
  // UPDATE (NEW always exists there), so it only ever checked the
  // *destination* post. `UPDATE post_references SET post_id =
  // '<own editable draft>' WHERE id = '<reference on an accepted paper>'`
  // passed, silently detaching the row from the locked publication it
  // belonged to. This version branches explicitly on TG_OP and checks
  // OLD's parent and NEW's parent separately, per the documented
  // convention that NEW is null on DELETE and OLD is null on INSERT
  // (https://www.postgresql.org/docs/18/plpgsql-trigger.html).
  type ParentPost = { status: string; type: string; content_kind?: string | null };

  // Phase 4A: same effective-content-kind-aware "research OR legacy
  // policy_brief" predicate as guard_locked_post_write's port above --
  // never article_format, so a Policy-Brief-format Article's references/
  // co-authors stay editable like any other Article's.
  function isResearchOrLegacyPolicyBrief(post: ParentPost): boolean {
    const kind =
      post.content_kind === "post" || post.content_kind === "article" || post.content_kind === "research"
        ? post.content_kind
        : post.type === "blog"
          ? "post"
          : post.type === "essay" || post.type === "policy_brief"
            ? "article"
            : post.type === "research"
              ? "research"
              : null;
    return kind === "research" || post.type === "policy_brief";
  }

  function isPostEditable(post: ParentPost): boolean {
    return !(
      (post.status === "published" && isResearchOrLegacyPolicyBrief(post)) ||
      post.status === "removed" ||
      post.status === "withdrawn"
    );
  }

  function guardLockedPostChildWrite(input: {
    role: "service_role" | "authenticated" | "anon" | null;
    // current_user -- see the equivalent comment on guardLockedPostWrite's
    // execRole above. Defaults to `role`.
    execRole?: string | null;
    op: "INSERT" | "UPDATE" | "DELETE";
    oldParentPost?: ParentPost;
    newParentPost?: ParentPost;
  }): { allowed: true } | { allowed: false } {
    const execRole = input.execRole === undefined ? input.role : input.execRole;
    if (input.role !== "authenticated" || execRole !== "authenticated") return { allowed: true };

    if (input.op === "DELETE") {
      return isPostEditable(input.oldParentPost!) ? { allowed: true } : { allowed: false };
    }

    if (input.op === "UPDATE" && !isPostEditable(input.oldParentPost!)) {
      return { allowed: false };
    }

    return isPostEditable(input.newParentPost!) ? { allowed: true } : { allowed: false };
  }

  it("blocks editing references/co-authors on an accepted research paper or policy brief", () => {
    for (const type of ["research", "policy_brief"]) {
      const result = guardLockedPostChildWrite({
        role: "authenticated",
        op: "UPDATE",
        oldParentPost: { status: "published", type },
        newParentPost: { status: "published", type },
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks editing references/co-authors on a removed post", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "UPDATE",
      oldParentPost: { status: "removed", type: "essay" },
      newParentPost: { status: "removed", type: "essay" },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks editing references/co-authors on a withdrawn submission", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "UPDATE",
      oldParentPost: { status: "withdrawn", type: "research" },
      newParentPost: { status: "withdrawn", type: "research" },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks reassigning a reference/co-author FROM a locked publication onto the author's own editable draft", () => {
    // This is exactly the bypass caught in review: only the destination
    // (an editable draft) was ever checked, so moving a row off a locked
    // publication silently succeeded.
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "UPDATE",
      oldParentPost: { status: "published", type: "research" },
      newParentPost: { status: "draft", type: "essay" },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks reassigning a reference/co-author from an editable draft ONTO a locked publication", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "UPDATE",
      oldParentPost: { status: "draft", type: "essay" },
      newParentPost: { status: "published", type: "policy_brief" },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks deleting a reference/co-author that belongs to a locked publication", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "DELETE",
      oldParentPost: { status: "published", type: "research" },
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks inserting a reference/co-author directly onto a locked publication", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "INSERT",
      newParentPost: { status: "published", type: "research" },
    });
    expect(result.allowed).toBe(false);
  });

  it("allows editing references/co-authors while the parent post is still draft/pending/pending_revision", () => {
    for (const status of ["draft", "pending", "pending_revision"]) {
      const result = guardLockedPostChildWrite({
        role: "authenticated",
        op: "UPDATE",
        oldParentPost: { status, type: "policy_brief" },
        newParentPost: { status, type: "policy_brief" },
      });
      expect(result.allowed).toBe(true);
    }
  });

  it("allows editing references on a published Article/Post -- those are never locked", () => {
    for (const type of ["blog", "essay"]) {
      const result = guardLockedPostChildWrite({
        role: "authenticated",
        op: "UPDATE",
        oldParentPost: { status: "published", type },
        newParentPost: { status: "published", type },
      });
      expect(result.allowed).toBe(true);
    }
  });

  it("allows moving a reference/co-author between two of the author's own editable (unlocked) posts", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "UPDATE",
      oldParentPost: { status: "draft", type: "essay" },
      newParentPost: { status: "pending", type: "policy_brief" },
    });
    expect(result.allowed).toBe(true);
  });

  it("always allows a service-role write, even against a locked parent post in either direction", () => {
    expect(
      guardLockedPostChildWrite({
        role: "service_role",
        op: "UPDATE",
        oldParentPost: { status: "published", type: "research" },
        newParentPost: { status: "draft", type: "essay" },
      }).allowed
    ).toBe(true);
    expect(
      guardLockedPostChildWrite({
        role: "service_role",
        op: "DELETE",
        oldParentPost: { status: "published", type: "research" },
      }).allowed
    ).toBe(true);
  });

  it("would bypass entirely for a SECURITY DEFINER function's own write, the same as guard_locked_post_write -- no such function touches these tables today, but the bypass conditions are kept identical rather than leaving a latent trap for whichever future one does", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      execRole: "postgres",
      op: "UPDATE",
      oldParentPost: { status: "published", type: "research" },
      newParentPost: { status: "published", type: "research" },
    });
    expect(result.allowed).toBe(true);
  });

  it("Phase 4A: keeps a published Policy-Brief-format Article's references/co-authors editable -- its legacy type is 'essay', never 'policy_brief'", () => {
    const result = guardLockedPostChildWrite({
      role: "authenticated",
      op: "UPDATE",
      oldParentPost: { status: "published", type: "essay", content_kind: "article" },
      newParentPost: { status: "published", type: "essay", content_kind: "article" },
    });
    expect(result.allowed).toBe(true);
  });

  it("Phase 4A: still locks a published legacy Policy Brief's references/co-authors, dual-written columns or not", () => {
    for (const contentKind of [undefined, "article"] as const) {
      const result = guardLockedPostChildWrite({
        role: "authenticated",
        op: "UPDATE",
        oldParentPost: { status: "published", type: "policy_brief", content_kind: contentKind },
        newParentPost: { status: "published", type: "policy_brief", content_kind: contentKind },
      });
      expect(result.allowed).toBe(false);
    }
  });
});

describe("guard_post_review_submission trigger logic (ported from SQL for testability)", () => {
  // Pure JS port of the trigger added alongside withdraw_post_submission()
  // in supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql.
  //
  // submitReview() (app/(main)/review/actions.ts) already scopes its own
  // UPDATE to `.is("recommendation", null).is("removed_at", null)`, which
  // Postgres's row-level locking makes safe against a *concurrent* write to
  // the exact same post_reviews row. This trigger is the independent,
  // defense-in-depth version of the same rule: it re-checks the *parent
  // post's* actual current status directly, so a recommendation can never
  // be recorded unless the submission is genuinely still open for review --
  // regardless of whether every path that closes a submission remembers to
  // set removed_at correctly.
  //
  // Revision (caught in review again): the RLS policy this trigger
  // backstops ("reviewer_can_submit") is scoped to `auth.uid() =
  // reviewer_id` but has no column-level restriction of its own, so a
  // direct authenticated write could reassign post_id/reviewer_id, replace
  // an already-submitted recommendation, or record one against an
  // assignment already retired (removed_at IS NOT NULL) by an editor's
  // removeReviewer() or by withdraw_post_submission(). Rewritten to also
  // require: post_id and reviewer_id are immutable; OLD.recommendation IS
  // NULL; OLD.removed_at IS NULL.
  //
  // Revision (caught in review yet again): that fix still only validated
  // removed_at inside the recommendation-changed branch, so a write that
  // left recommendation alone -- `SET removed_at = NULL` and nothing else
  // -- passed untouched. That is precisely how a removed reviewer could
  // reactivate themselves, undoing what is_post_reviewer()'s removed_at
  // check and "reviewer_can_submit"'s own USING/WITH CHECK were supposed to
  // revoke. Rewritten so round/assigned_at/removed_at/reminded_at are
  // immutable unconditionally, not just alongside a recommendation change.
  //
  // BLOCKING regression (caught in review once more): the unconditional
  // removed_at check above broke withdraw_post_submission() itself.
  // SECURITY DEFINER changes current_user (to the function's owner) but
  // never touches the request.jwt.claims GUC auth.role() reads, so inside
  // that function auth.role() still reads 'authenticated' -- the bypass
  // never fired, and the function's own `SET removed_at = now()` tripped
  // its own new backstop, rolling back the whole withdrawal transaction
  // (including the post's status change). Rewritten to also require
  // current_user = 'authenticated', which the RPC's execution context
  // never satisfies but a genuine direct authenticated write always does.
  function guardPostReviewSubmission(input: {
    role: "service_role" | "authenticated" | "anon" | null;
    // current_user -- see the equivalent comment on guardLockedPostWrite's
    // execRole in the describe block above. Defaults to `role`.
    execRole?: string | null;
    oldPostId?: string;
    newPostId?: string;
    oldReviewerId?: string;
    newReviewerId?: string;
    oldRound?: number;
    newRound?: number;
    oldAssignedAt?: string;
    newAssignedAt?: string;
    oldRemovedAt?: string | null;
    newRemovedAt?: string | null;
    oldRemindedAt?: string | null;
    newRemindedAt?: string | null;
    oldRecommendation: string | null;
    newRecommendation: string | null;
    parentPostStatus: string;
  }): { allowed: true } | { allowed: false } {
    const execRole = input.execRole === undefined ? input.role : input.execRole;
    if (input.role !== "authenticated" || execRole !== "authenticated") return { allowed: true };

    // `?? oldX` would be wrong for the nullable fields below: null is a
    // legitimate, distinct *value* for removed_at/reminded_at (not merely
    // "unset"), and `??` treats an explicitly-passed null the same as an
    // absent property, silently coalescing it back to the old value. Only
    // `undefined` (the property genuinely omitted) should fall back.
    const oldPostId = input.oldPostId ?? "post-1";
    const newPostId = input.newPostId ?? oldPostId;
    const oldReviewerId = input.oldReviewerId ?? "reviewer-1";
    const newReviewerId = input.newReviewerId ?? oldReviewerId;
    const oldRound = input.oldRound ?? 1;
    const newRound = input.newRound ?? oldRound;
    const oldAssignedAt = input.oldAssignedAt ?? "2026-01-01T00:00:00.000Z";
    const newAssignedAt = input.newAssignedAt ?? oldAssignedAt;
    const oldRemovedAt = input.oldRemovedAt === undefined ? null : input.oldRemovedAt;
    const newRemovedAt = input.newRemovedAt === undefined ? oldRemovedAt : input.newRemovedAt;
    const oldRemindedAt = input.oldRemindedAt === undefined ? null : input.oldRemindedAt;
    const newRemindedAt = input.newRemindedAt === undefined ? oldRemindedAt : input.newRemindedAt;

    if (
      newPostId !== oldPostId ||
      newReviewerId !== oldReviewerId ||
      newRound !== oldRound ||
      newAssignedAt !== oldAssignedAt ||
      newRemovedAt !== oldRemovedAt ||
      newRemindedAt !== oldRemindedAt
    ) {
      return { allowed: false };
    }

    if (input.newRecommendation !== input.oldRecommendation) {
      if (input.oldRecommendation !== null) {
        return { allowed: false };
      }
      if (oldRemovedAt !== null) {
        return { allowed: false };
      }
      if (input.parentPostStatus !== "pending") {
        return { allowed: false };
      }
    }

    return { allowed: true };
  }

  it("allows a reviewer to submit a recommendation while the parent post is pending", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRecommendation: null,
      newRecommendation: "accept",
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks a reviewer submitting a recommendation once the parent post is no longer pending -- withdrawn, accepted, or anything else", () => {
    for (const status of ["withdrawn", "published", "pending_revision", "rejected", "removed", "draft"]) {
      const result = guardPostReviewSubmission({
        role: "authenticated",
        oldRecommendation: null,
        newRecommendation: "accept",
        parentPostStatus: status,
      });
      expect(result.allowed).toBe(false);
    }
  });

  it("blocks a direct authenticated write that self-reactivates a retired assignment by clearing removed_at, even though recommendation is untouched -- this is the exact bypass caught in review", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRemovedAt: "2026-07-20T00:00:00.000Z",
      newRemovedAt: null,
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "withdrawn",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks a direct authenticated write retiring a still-active assignment by setting removed_at -- only editorial review management may retire an assignment", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRemovedAt: null,
      newRemovedAt: "2026-07-20T00:00:00.000Z",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks a direct authenticated write reassigning round", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRound: 1,
      newRound: 2,
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks a direct authenticated write changing assigned_at", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldAssignedAt: "2026-01-01T00:00:00.000Z",
      newAssignedAt: "2026-07-20T00:00:00.000Z",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks a direct authenticated write changing reminded_at", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRemindedAt: null,
      newRemindedAt: "2026-07-20T00:00:00.000Z",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("allows an ordinary authenticated write that leaves every assignment-management field unchanged -- e.g. a no-op re-save", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "withdrawn",
    });
    expect(result.allowed).toBe(true);
  });

  it("always allows a service-role write regardless of parent post status -- editor/admin review management", () => {
    const result = guardPostReviewSubmission({
      role: "service_role",
      oldRecommendation: null,
      newRecommendation: "accept",
      parentPostStatus: "withdrawn",
    });
    expect(result.allowed).toBe(true);
  });

  it("blocks a direct authenticated write reassigning post_id", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldPostId: "post-1",
      newPostId: "post-2",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks a direct authenticated write reassigning reviewer_id", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldReviewerId: "reviewer-1",
      newReviewerId: "reviewer-2",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks replacing an already-submitted recommendation", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRecommendation: "accept",
      newRecommendation: "reject",
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("blocks recording a recommendation against a retired (removed_at set) review assignment", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      oldRecommendation: null,
      newRecommendation: "accept",
      oldRemovedAt: "2026-07-20T00:00:00.000Z",
      parentPostStatus: "pending",
    });
    expect(result.allowed).toBe(false);
  });

  it("always allows a service-role write that reassigns post_id/reviewer_id/round/assigned_at/removed_at/reminded_at -- editor/admin review management (assignReviewer()/removeReviewer()) runs through the admin client, not this RLS-scoped path", () => {
    const result = guardPostReviewSubmission({
      role: "service_role",
      oldPostId: "post-1",
      newPostId: "post-2",
      oldReviewerId: "reviewer-1",
      newReviewerId: "reviewer-2",
      oldRound: 1,
      newRound: 2,
      oldAssignedAt: "2026-01-01T00:00:00.000Z",
      newAssignedAt: "2026-07-20T00:00:00.000Z",
      oldRemovedAt: "2026-07-20T00:00:00.000Z",
      newRemovedAt: null,
      oldRemindedAt: null,
      newRemindedAt: "2026-07-20T00:00:00.000Z",
      oldRecommendation: "accept",
      newRecommendation: "reject",
      parentPostStatus: "withdrawn",
    });
    expect(result.allowed).toBe(true);
  });

  it("bypasses entirely for withdraw_post_submission()'s own removed_at update -- this is the exact regression caught in review: auth.role() alone still read 'authenticated' inside the SECURITY DEFINER function, so the unconditional removed_at-immutability check above rejected the RPC's own retirement write and rolled back the whole withdrawal", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      execRole: "postgres",
      oldRemovedAt: null,
      newRemovedAt: "2026-07-20T00:00:00.000Z",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "withdrawn",
    });
    expect(result.allowed).toBe(true);
  });

  it("still blocks the identical write when it is a genuine direct authenticated request -- current_user really is 'authenticated' there, unlike inside withdraw_post_submission()", () => {
    const result = guardPostReviewSubmission({
      role: "authenticated",
      execRole: "authenticated",
      oldRemovedAt: null,
      newRemovedAt: "2026-07-20T00:00:00.000Z",
      oldRecommendation: null,
      newRecommendation: null,
      parentPostStatus: "withdrawn",
    });
    expect(result.allowed).toBe(false);
  });
});

describe("reviewer_can_submit RLS policy (ported from SQL for testability)", () => {
  // Pure JS port of the "reviewer_can_submit" UPDATE policy on
  // post_reviews, as recreated in
  // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql
  // (originally `USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() =
  // reviewer_id)` in 20260420193000_journal_system.sql, with no column
  // restriction at all). USING gates which existing rows a reviewer's own
  // UPDATE can even select; WITH CHECK gates what the resulting row may
  // look like. The bypass this closes: a removed reviewer's row used to
  // stay reachable under the old USING clause, so `SET removed_at = NULL`
  // (recommendation untouched) passed RLS and reached the trigger, which at
  // the time only checked removed_at when recommendation changed --
  // silently restoring the exact access withdraw_post_submission()/
  // removeReviewer() had just revoked.
  function passesUsing(input: { callerId: string; reviewerId: string; recommendation: string | null; removedAt: string | null }): boolean {
    return (
      input.callerId === input.reviewerId &&
      input.recommendation === null &&
      input.removedAt === null
    );
  }

  function passesWithCheck(input: { callerId: string; reviewerId: string; removedAt: string | null }): boolean {
    return input.callerId === input.reviewerId && input.removedAt === null;
  }

  it("USING allows a reviewer to reach their own row while it is active and unsubmitted", () => {
    expect(
      passesUsing({ callerId: "reviewer-1", reviewerId: "reviewer-1", recommendation: null, removedAt: null })
    ).toBe(true);
  });

  it("USING makes a removed reviewer's own row unreachable for a direct update -- closes the self-reactivation bypass at the row-selection stage, before WITH CHECK or the trigger ever run", () => {
    expect(
      passesUsing({
        callerId: "reviewer-1",
        reviewerId: "reviewer-1",
        recommendation: null,
        removedAt: "2026-07-20T00:00:00.000Z",
      })
    ).toBe(false);
  });

  it("USING makes an already-submitted reviewer's own row unreachable for a direct update", () => {
    expect(
      passesUsing({ callerId: "reviewer-1", reviewerId: "reviewer-1", recommendation: "accept", removedAt: null })
    ).toBe(false);
  });

  it("USING never grants access to a row that isn't the caller's own assignment", () => {
    expect(
      passesUsing({ callerId: "reviewer-2", reviewerId: "reviewer-1", recommendation: null, removedAt: null })
    ).toBe(false);
  });

  it("WITH CHECK rejects a resulting row with any non-null removed_at -- a reviewer can never retire their own assignment", () => {
    expect(
      passesWithCheck({ callerId: "reviewer-1", reviewerId: "reviewer-1", removedAt: "2026-07-20T00:00:00.000Z" })
    ).toBe(false);
  });

  it("WITH CHECK allows a resulting row that stays theirs with removed_at still null", () => {
    expect(passesWithCheck({ callerId: "reviewer-1", reviewerId: "reviewer-1", removedAt: null })).toBe(true);
  });
});

describe("is_post_reviewer (ported from SQL for testability)", () => {
  // Pure JS port of is_post_reviewer() as redefined in
  // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql
  // (originally defined without a removed_at check in
  // 20260423000006_fix_editorial_rls_cycles.sql). Feeds the posts SELECT
  // policy ("Published posts are viewable by everyone") and
  // post_references' "attached_reviewer_or_coauthor_reads_references"
  // policy -- so a retired assignment (an editor's removeReviewer(), or
  // withdraw_post_submission() retiring every active review on withdrawal)
  // must stop granting read access, not just stop showing up in the
  // reviewer's queue UI.
  function isPostReviewer(input: { reviewerId: string; callerId: string; removedAt: string | null }): boolean {
    return input.reviewerId === input.callerId && input.removedAt === null;
  }

  it("grants access to an actively assigned reviewer", () => {
    expect(isPostReviewer({ reviewerId: "user-1", callerId: "user-1", removedAt: null })).toBe(true);
  });

  it("revokes access once the assignment is retired -- removed by an editor, or by a withdrawal", () => {
    expect(
      isPostReviewer({ reviewerId: "user-1", callerId: "user-1", removedAt: "2026-07-20T00:00:00.000Z" })
    ).toBe(false);
  });

  it("never grants access to someone who isn't the assigned reviewer", () => {
    expect(isPostReviewer({ reviewerId: "user-1", callerId: "user-2", removedAt: null })).toBe(false);
  });
});

describe("Authors can update their own posts -- RLS WITH CHECK (ported from SQL for testability)", () => {
  // Pure JS port of the WITH CHECK clause added to the posts UPDATE policy
  // in supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql.
  // Closes a gap the trigger alone couldn't: guard_locked_post_write
  // validates the *shape* of a withdrawn transition, but until this policy
  // had its own WITH CHECK, Postgres reused its USING clause (auth.uid() =
  // author_id) for the resulting row too, so any direct authenticated write
  // matching that shape passed RLS identically to going through
  // withdraw_post_submission() -- skipping that function's
  // post_reviews.removed_at cleanup entirely.
  function passesAuthorUpdateCheck(input: { callerId: string; authorId: string; newStatus: string }): boolean {
    return input.callerId === input.authorId && input.newStatus !== "withdrawn";
  }

  it("allows an author's ordinary update that doesn't touch status='withdrawn'", () => {
    expect(passesAuthorUpdateCheck({ callerId: "user-1", authorId: "user-1", newStatus: "draft" })).toBe(true);
  });

  it("rejects a direct authenticated write that would leave status='withdrawn' -- only withdraw_post_submission() (SECURITY DEFINER, bypasses RLS as the function owner) may set it", () => {
    expect(passesAuthorUpdateCheck({ callerId: "user-1", authorId: "user-1", newStatus: "withdrawn" })).toBe(
      false
    );
  });

  it("rejects a write from anyone other than the post's author, regardless of status", () => {
    expect(passesAuthorUpdateCheck({ callerId: "user-2", authorId: "user-1", newStatus: "draft" })).toBe(false);
  });
});
