/**
 * Pure, universally-importable helpers for lightweight Post bodies (Phase
 * 2 of the content-model migration; see docs/content-model.md). Kept free
 * of any server-only dependency (see lib/shortPostHtml.ts for the
 * sanitize-dependent HTML builder) so the composer's client-side
 * character counter can import it directly.
 */

export const SHORT_POST_MAX_CHARACTERS = 2000;

/** Collapses CRLF to LF and trims leading/trailing whitespace, without touching internal spacing. */
export function normalizeShortPostText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

/** Character count on normalized, user-visible text -- never on generated HTML. */
export function countShortPostCharacters(raw: string): number {
  return normalizeShortPostText(raw).length;
}

export function isShortPostBodyValid(raw: string): boolean {
  const normalized = normalizeShortPostText(raw);
  return normalized.length > 0 && normalized.length <= SHORT_POST_MAX_CHARACTERS;
}

/** A short, single-line preview derived from the post's own body -- for feed cards, OG description, etc. */
export function deriveShortPostExcerpt(raw: string, maxLength = 200): string | null {
  const normalized = normalizeShortPostText(raw).replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).replace(/\s+\S*$/, "")}...`;
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Best-effort inverse of buildShortPostHtml() (lib/shortPostHtml.ts), for
 * re-populating the composer textarea when editing an existing Post. Only
 * needs to handle HTML that module itself produces (<p>, <br>, and
 * <a href="URL">URL</a> where the link text always equals the href) -- it
 * is not a general HTML-to-text converter.
 */
export function shortPostHtmlToText(html: string): string {
  const withoutParagraphBreaks = html
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/^<p>/i, "")
    .replace(/<\/p>\s*$/i, "");
  const withoutLineBreaks = withoutParagraphBreaks.replace(/<br\s*\/?>/gi, "\n");
  const withoutAnchors = withoutLineBreaks.replace(/<a\s[^>]*>(.*?)<\/a>/gi, "$1");
  return unescapeHtml(withoutAnchors).trim();
}
