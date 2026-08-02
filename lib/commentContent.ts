/**
 * Pure helpers for comment bodies, mirroring lib/shortPostContent.ts. Kept free
 * of any server-only dependency so the composer's character counter can import
 * it directly, and so the server action can re-validate with the exact same
 * rules the client showed the writer.
 *
 * A comment is plain text end to end: stored raw in `comments.content` and
 * rendered as a React text node, never as HTML. That is the `messages`
 * precedent rather than the buildShortPostHtml() one -- there is no markup to
 * sanitise, so there is no injection surface to get wrong.
 */

/** Long enough for a real paragraph of argument; short enough that anything
 *  past it genuinely wants to be a Response. */
export const COMMENT_MAX_CHARACTERS = 1000;

/**
 * Text left in place of a deleted comment that other people have replied to.
 * `comments.parent_id` is ON DELETE CASCADE, so hard-deleting such a comment
 * would take somebody else's replies with it -- the author gets their words
 * removed either way, but the thread around them survives.
 *
 * Lives here rather than in commentActions.ts because a "use server" module may
 * only export async functions.
 */
export const DELETED_COMMENT_TOMBSTONE = "[deleted]";

/** Where the composer starts suggesting a Response instead. */
export const COMMENT_PROMOTION_THRESHOLD = 400;

/** Collapses CRLF to LF and trims the ends, leaving internal spacing alone. */
export function normalizeCommentText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").trim();
}

/** Character count on the normalized, user-visible text. */
export function countCommentCharacters(raw: string): number {
  return normalizeCommentText(raw).length;
}

export function isCommentBodyValid(raw: string): boolean {
  const normalized = normalizeCommentText(raw);
  return normalized.length > 0 && normalized.length <= COMMENT_MAX_CHARACTERS;
}

/** The error a rejected body should report, or null when it is fine. Shared so
 *  the client and the server action never disagree about the reason. */
export function getCommentBodyError(raw: string): string | null {
  const normalized = normalizeCommentText(raw);
  if (normalized.length === 0) return "Write something before posting.";
  if (normalized.length > COMMENT_MAX_CHARACTERS) {
    return `Comments can be at most ${COMMENT_MAX_CHARACTERS} characters (currently ${normalized.length}).`;
  }
  return null;
}

/** A short single-line preview for notification, email and push bodies. */
export function deriveCommentPreview(raw: string, maxLength = 180): string {
  const normalized = normalizeCommentText(raw).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}...`;
}
