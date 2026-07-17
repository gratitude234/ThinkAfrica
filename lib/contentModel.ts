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
