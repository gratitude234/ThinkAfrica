/**
 * The content model, entire.
 *
 * A piece of writing is a Post or an Article, and its title decides which: no
 * title is a Post, a title is an Article. There is no type picker, no format
 * picker, and no third kind. See docs/content-model.md.
 *
 * This module used to carry the transition it was named for: three kinds, two
 * article genres, a legacy `posts.type` column to fall back to, and a set of
 * rules about which kind needed formal review. The publishing reset removed
 * Research, Policy Briefs, Essays-as-a-genre and the review workflow from the
 * product, and Phase 2I removed them from the database: `content_kind` is NOT
 * NULL and constrained to 'post' and 'article', `article_format` is always
 * null, and `posts.type` is derived by the database from `content_kind` for as
 * long as the column survives. See
 * supabase/migrations/20260915000005_normalize_post_classification.sql and
 * 20260915000006_canonical_post_classification.sql.
 *
 * So there is no dual-model helper here any more, deliberately. A reader who
 * wants to know what a row is reads `content_kind`, and nothing else resolves,
 * infers, falls back, or maps.
 */

export type ContentKind = "post" | "article";

const CONTENT_KINDS: readonly ContentKind[] = ["post", "article"];

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === "string" && (CONTENT_KINDS as readonly string[]).includes(value);
}

/** Safe guard for untrusted input (query strings, request bodies). Returns null instead of throwing. */
export function parseContentKind(value: unknown): ContentKind | null {
  return isContentKind(value) ? value : null;
}

/**
 * What a record is.
 *
 * Reads `content_kind` and only `content_kind`. The legacy `type` fallback this
 * function used to carry is gone: every row carries a canonical content_kind,
 * and a fallback would be a second opinion about a question that now has one
 * answer. An unrecognised or absent value resolves to null rather than
 * throwing, so a caller renders a safe default instead of crashing.
 */
export function resolveContentKind(record: {
  content_kind?: string | null;
}): ContentKind | null {
  return parseContentKind(record.content_kind);
}

/**
 * The product rule, in one place: a title makes it an Article.
 *
 * Every write path routes through this rather than deciding for itself, so the
 * composer, the published-edit apply and the database trigger cannot drift
 * apart about what a piece is.
 */
export function contentKindForTitle(title: string | null | undefined): ContentKind {
  return title?.trim() ? "article" : "post";
}

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  post: "Post",
  article: "Article",
};

/** Fails safely: an unknown or null kind renders as a generic label instead of crashing. */
export function getContentKindLabel(kind: ContentKind | null | undefined): string {
  if (kind && CONTENT_KIND_LABELS[kind]) return CONTENT_KIND_LABELS[kind];
  return "Content";
}

/**
 * Whether the kind requires a title. The inverse of contentKindForTitle(), and
 * the rule the database states as posts_title_required_unless_post_check.
 */
export function contentKindRequiresTitle(kind: ContentKind | null | undefined): boolean {
  return kind === "article";
}
