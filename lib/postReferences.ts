/**
 * Shared reference handling for every path that writes `post_references`.
 *
 * Inline citations are plain anchors to `#ref-id-<post_references.id>`, and the
 * rendered bibliography emits matching `id` attributes. That makes the row id
 * part of the published document: any code that rewrites a post's references by
 * deleting and re-inserting them silently breaks every citation in the body.
 * Reference ids therefore have to survive the whole round trip, which is why
 * these helpers live in one place instead of being re-derived per action file.
 */

/** A reference as it travels between composer state, server actions and the DB. */
export interface ReferenceLike {
  id?: string | null;
  ref_type?: string | null;
  authors?: string | null;
  title?: string | null;
  year?: number | null;
  source?: string | null;
  url?: string | null;
  doi?: string | null;
  raw?: string | null;
}

const PERSISTED_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A reference row earns storage once it carries anything a reader could use.
 * Blank rows are the composer's empty form fields, not sources.
 */
export function hasReferenceContent(reference: ReferenceLike) {
  return Boolean(
    reference.title?.trim() ||
      reference.authors?.trim() ||
      reference.source?.trim() ||
      reference.url?.trim() ||
      reference.doi?.trim() ||
      reference.raw?.trim()
  );
}

/**
 * Resolves the database id a reference should keep. Composer-local rows arrive
 * prefixed with `temp-`; a `temp-` row that never reached the database has no
 * id to preserve and returns null so the caller inserts a fresh one.
 */
export function getPersistedReferenceId(referenceId?: string | null) {
  if (!referenceId) return null;
  const candidate = referenceId.startsWith("temp-")
    ? referenceId.slice("temp-".length)
    : referenceId;
  return PERSISTED_ID_PATTERN.test(candidate)
    ? candidate
    : referenceId.startsWith("temp-")
      ? null
      : candidate;
}

/**
 * Rejects content whose citations point at sources that are no longer present.
 * Handles both marker styles the editor has produced: `[ref:<id>]` shortcodes
 * and `#ref-id-<id>` anchors, plus purely positional `[ref:3]` markers.
 */
export function validateCitationReferences(content: string, references: ReferenceLike[]) {
  const citationKeys = new Set<string>();
  const shortcodePattern = /\[ref:([a-zA-Z0-9-]+)\]/g;
  const anchorPattern = /href=["']#ref-id-([a-zA-Z0-9-]+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = shortcodePattern.exec(content)) !== null) {
    citationKeys.add(match[1]);
  }
  while ((match = anchorPattern.exec(content)) !== null) {
    citationKeys.add(match[1]);
  }
  if (citationKeys.size === 0) return null;

  const stored = references.filter(hasReferenceContent);
  const referenceIds = new Set(
    stored
      .map((reference) => getPersistedReferenceId(reference.id))
      .filter((id): id is string => Boolean(id))
  );
  const hasOrphan = Array.from(citationKeys).some((key) => {
    if (/^\d+$/.test(key)) {
      const position = Number.parseInt(key, 10);
      return position < 1 || position > stored.length;
    }
    return !referenceIds.has(key);
  });

  return hasOrphan
    ? "A citation points to a source that was removed. Restore the source or remove its marker before publishing."
    : null;
}
