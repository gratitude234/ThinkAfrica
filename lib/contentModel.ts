/**
 * Phase 1 of the Post/Article/Research content-model migration.
 * See docs/content-model.md for the full rationale and rollout plan.
 *
 * This module is the single source of truth for classifying posts under
 * the target model:
 *   - post:     lightweight, short-form, publishes immediately, never reviewed
 *   - article:  long-form rich text (essay/policy_brief are optional genres)
 *   - research: formal paper, goes through the existing review workflow
 *
 * Legacy `posts.type` mapping:
 *   blog          -> content_kind "post"
 *   essay         -> content_kind "article", article_format "essay"
 *   policy_brief  -> content_kind "article", article_format "policy_brief"
 *   research      -> content_kind "research"
 *
 * `content_kind`/`article_format` are additive, nullable columns living
 * alongside the legacy `type` column during the transition. Resolver
 * functions below prefer the new columns and fall back to `type`, so
 * callers never need to branch on which column happens to be populated.
 */

import type { PostType } from "@/lib/utils";

export type ContentKind = "post" | "article" | "research";
export type ArticleFormat = "essay" | "policy_brief";

/** The pre-Phase-1 `posts.type` values. Kept distinct from ContentKind so callers can't conflate the two. */
export type LegacyPostType = PostType;

const CONTENT_KINDS: readonly ContentKind[] = ["post", "article", "research"];
const ARTICLE_FORMATS: readonly ArticleFormat[] = ["essay", "policy_brief"];
const LEGACY_POST_TYPES: readonly LegacyPostType[] = ["blog", "essay", "policy_brief", "research"];

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === "string" && (CONTENT_KINDS as readonly string[]).includes(value);
}

export function isArticleFormat(value: unknown): value is ArticleFormat {
  return typeof value === "string" && (ARTICLE_FORMATS as readonly string[]).includes(value);
}

export function isLegacyPostType(value: unknown): value is LegacyPostType {
  return typeof value === "string" && (LEGACY_POST_TYPES as readonly string[]).includes(value);
}

/** Safe guard for untrusted input (query strings, request bodies). Returns null instead of throwing. */
export function parseContentKind(value: unknown): ContentKind | null {
  return isContentKind(value) ? value : null;
}

/** Safe guard for untrusted input (query strings, request bodies). Returns null instead of throwing. */
export function parseArticleFormat(value: unknown): ArticleFormat | null {
  return isArticleFormat(value) ? value : null;
}

const LEGACY_TYPE_TO_CONTENT_KIND: Record<LegacyPostType, ContentKind> = {
  blog: "post",
  essay: "article",
  policy_brief: "article",
  research: "research",
};

const LEGACY_TYPE_TO_ARTICLE_FORMAT: Partial<Record<LegacyPostType, ArticleFormat>> = {
  essay: "essay",
  policy_brief: "policy_brief",
};

/** Maps a legacy `type` value to its target content_kind. Returns null for unknown/null input. */
export function contentKindFromLegacyType(type: string | null | undefined): ContentKind | null {
  if (!isLegacyPostType(type)) return null;
  return LEGACY_TYPE_TO_CONTENT_KIND[type];
}

/** Maps a legacy `type` value to its target article_format. Returns null when the type has no genre (blog/research) or is unknown. */
export function articleFormatFromLegacyType(type: string | null | undefined): ArticleFormat | null {
  if (!isLegacyPostType(type)) return null;
  return LEGACY_TYPE_TO_ARTICLE_FORMAT[type] ?? null;
}

interface ClassifiableRecord {
  content_kind?: string | null;
  article_format?: string | null;
  type?: string | null;
}

/**
 * Resolves the effective content kind for a post record. Prefers the new
 * `content_kind` column; falls back to the legacy `type` column when it's
 * null or absent. Unknown/null values resolve to null rather than
 * throwing, so callers can render a safe default instead of crashing.
 */
export function resolveContentKind(record: ClassifiableRecord): ContentKind | null {
  if (isContentKind(record.content_kind)) {
    return record.content_kind;
  }
  return contentKindFromLegacyType(record.type ?? null);
}

/**
 * Resolves the effective article format for a post record. Only
 * meaningful when the resolved content kind is "article"; returns null
 * otherwise. Prefers the new `article_format` column, falling back to the
 * legacy `type` column.
 */
export function resolveArticleFormat(record: ClassifiableRecord): ArticleFormat | null {
  if (resolveContentKind(record) !== "article") {
    return null;
  }
  if (isArticleFormat(record.article_format)) {
    return record.article_format;
  }
  // Only fall back to inferring a format from the legacy `type` when
  // content_kind itself isn't an explicit, populated new-model value. Once a
  // record has an explicit content_kind, it is authoritative -- a null
  // article_format means "no format" (a generic Article), not "go infer one
  // from the legacy type". Without this guard, a brand-new generic Article
  // dual-written as type="essay"/content_kind="article"/article_format=null
  // would be indistinguishable from a genuine legacy Essay.
  if (isContentKind(record.content_kind)) {
    return null;
  }
  return articleFormatFromLegacyType(record.type ?? null);
}

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  post: "Post",
  article: "Article",
  research: "Research",
};

export const ARTICLE_FORMAT_LABELS: Record<ArticleFormat, string> = {
  essay: "Essay",
  policy_brief: "Policy Brief",
};

/** Fails safely: unknown/null kinds render as a generic label instead of crashing. */
export function getContentKindLabel(kind: ContentKind | null | undefined): string {
  if (kind && CONTENT_KIND_LABELS[kind]) return CONTENT_KIND_LABELS[kind];
  return "Content";
}

/** Fails safely: unknown/null formats render as null (no badge) instead of crashing. */
export function getArticleFormatLabel(format: ArticleFormat | null | undefined): string | null {
  if (format && ARTICLE_FORMAT_LABELS[format]) return ARTICLE_FORMAT_LABELS[format];
  return null;
}

interface ContentKindRules {
  /** Whether the target model requires a title for this kind. */
  requiresTitle: boolean;
  /** Whether content of this kind publishes immediately, without an editorial gate. */
  publishesImmediately: boolean;
  /** Whether this kind's workflow requires formal (editor/reviewer) review before publication. */
  requiresFormalReview: boolean;
  /** Whether this kind belongs among "formal publications" (citable, archived). */
  isFormalPublication: boolean;
}

const CONTENT_KIND_RULES: Record<ContentKind, ContentKindRules> = {
  post: {
    requiresTitle: false,
    publishesImmediately: true,
    requiresFormalReview: false,
    isFormalPublication: false,
  },
  article: {
    requiresTitle: true,
    publishesImmediately: true,
    requiresFormalReview: false,
    isFormalPublication: false,
  },
  research: {
    requiresTitle: true,
    publishesImmediately: false,
    requiresFormalReview: true,
    isFormalPublication: true,
  },
};

// Unknown/null content kinds fail safe toward the *more* restrictive
// behaviour (title required, not immediate, review required) rather than
// silently granting a new/malformed record the loosest rules.
const FALLBACK_CONTENT_KIND_RULES: ContentKindRules = {
  requiresTitle: true,
  publishesImmediately: false,
  requiresFormalReview: true,
  isFormalPublication: false,
};

export function getContentKindRules(kind: ContentKind | null | undefined): ContentKindRules {
  if (kind && CONTENT_KIND_RULES[kind]) return CONTENT_KIND_RULES[kind];
  return FALLBACK_CONTENT_KIND_RULES;
}

export function contentKindRequiresTitle(kind: ContentKind | null | undefined): boolean {
  return getContentKindRules(kind).requiresTitle;
}

export function contentKindPublishesImmediately(kind: ContentKind | null | undefined): boolean {
  return getContentKindRules(kind).publishesImmediately;
}

export function contentKindRequiresFormalReview(kind: ContentKind | null | undefined): boolean {
  return getContentKindRules(kind).requiresFormalReview;
}

export function contentKindIsFormalPublication(kind: ContentKind | null | undefined): boolean {
  return getContentKindRules(kind).isFormalPublication;
}

/**
 * Whether a specific post record has actually completed review — derived
 * from workflow evidence (citation_id / published_version_id), NEVER from
 * content_kind alone. `contentKindRequiresFormalReview` above only says a
 * kind's workflow *requires* review as a matter of policy; it says
 * nothing about whether a given record has completed it. Callers must not
 * treat "content_kind is research" as proof of review.
 *
 * CAUTION: as of Phase 1, `published_version_id` is only ever set by
 * `publishReviewedPost()` (lib/reviewWorkflow.ts) after an editor accepts
 * a submission, so either field being present is currently sufficient
 * proof. If a later phase introduces versioning for unreviewed content
 * (e.g. Article edit history), `published_version_id` alone will stop
 * being sufficient and this function must be updated to depend on
 * something unambiguous to formal acceptance — an accepted editor
 * decision, completed required reviews, and/or an explicit review status
 * — not just "a published version exists".
 */
export function isFormallyReviewed(record: {
  citation_id?: string | null;
  published_version_id?: string | null;
}): boolean {
  return Boolean(record.citation_id) || Boolean(record.published_version_id);
}

/**
 * Phase 3 (the "migrate" step): the temporary legacy `type` value to
 * dual-write when creating NEW content of a given kind, since `type`
 * still has a NOT NULL constraint. This is the single place that decides
 * what a brand-new Post or Article's legacy value is -- server actions
 * should call this instead of hardcoding "blog"/"essay" independently.
 *
 * Deliberately returns null for "research": research records are created
 * through their own dedicated submission flow (app/(main)/submit/research),
 * never through this generic new-content mapping, so there is no safe
 * guess to synthesize here -- a caller that ends up with null for
 * "research" has a bug to fix, not a value to fall back on.
 *
 * Deliberately IGNORES article_format: a brand-new Article always
 * dual-writes type="essay" regardless of its chosen genre (including
 * "policy_brief"). This is not an oversight -- it is load-bearing. See
 * isLegacyPolicyBriefInFlight() below for why a NEW Policy-Brief-format
 * Article must never be written with the literal legacy value
 * type="policy_brief".
 */
export function legacyTypeForNewContent(kind: ContentKind): LegacyPostType | null {
  if (kind === "post") return "blog";
  if (kind === "article") return "essay";
  return null;
}

/**
 * Phase 4A: three distinct concepts that must never collapse into one
 * boolean (see docs/content-model-phase4a-audit.md):
 *   1. "Requires review by product policy"     -> contentKindRequiresFormalReview()
 *   2. "Already entered a legacy review workflow" -> isLegacyPolicyBriefInFlight() (this section)
 *   3. "Has completed formal review"            -> isFormallyReviewed()
 *
 * Under the target model, only content_kind "research" requires formal
 * review; an Article's article_format ("essay"/"policy_brief") is
 * descriptive metadata and must never by itself trigger, imply, or prove
 * review. But existing legacy Policy Brief submissions that were already
 * pending/pending_revision *before* this phase shipped are mid-workflow --
 * a reviewer may already be assigned, an editor may already be mid-
 * decision -- and must be allowed to finish exactly as they would have
 * under the old model (be accepted, rejected, sent back for revision, or
 * withdrawn) rather than being silently ejected from review or stranded.
 *
 * This is a NARROWLY SCOPED, TEMPORARY compatibility path, isolated to
 * this one function so every caller that needs it is explicit about why:
 *   - Scoped to the literal legacy `type === "policy_brief"` value, never
 *     to `article_format === "policy_brief"`. A brand-new Policy-Brief-
 *     format Article always dual-writes type="essay" (see
 *     legacyTypeForNewContent() above), so it can never match here --
 *     only a row that predates Phase 4A (or was written by code that
 *     still hasn't been migrated) carries the literal type="policy_brief"
 *     value at all.
 *   - Scoped to status IN (pending, pending_revision) -- the two states
 *     that mean "actively inside the reviewer/editor workflow right now".
 *     A published (accepted) legacy Policy Brief is handled by
 *     isFormallyReviewed()/contentKindIsFormalPublication() instead (it's
 *     done, not in flight); a draft/rejected/removed/withdrawn one needs
 *     no special workflow routing at all.
 *
 * Phase 4B removes this function (and every caller's use of it) once
 * every legacy pending/pending_revision Policy Brief has been resolved --
 * see docs/content-model.md for the exact exit criterion.
 */
export function isLegacyPolicyBriefInFlight(record: {
  type?: string | null;
  status?: string | null;
}): boolean {
  return record.type === "policy_brief" && (record.status === "pending" || record.status === "pending_revision");
}

/**
 * The composite decision callers actually need when routing a specific
 * record through (or away from) editorial workflow -- e.g. "does
 * submitting/editing this post right now need to go through reviewers".
 * Deliberately a thin OR over the two independent concepts above rather
 * than a new primitive: a record needs editorial workflow either because
 * product policy requires it for its kind (research), or because it's a
 * legacy Policy Brief already mid-workflow. Neither on its own is
 * sufficient, and this function must never be used as a substitute for
 * isFormallyReviewed() -- needing workflow and having completed it are
 * opposite ends of the same process, not the same fact.
 */
export function needsEditorialWorkflow(record: {
  type?: string | null;
  content_kind?: string | null;
  status?: string | null;
}): boolean {
  return contentKindRequiresFormalReview(resolveContentKind(record)) || isLegacyPolicyBriefInFlight(record);
}
