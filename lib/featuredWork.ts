/**
 * Featured Work: the selection contract shared by the manager, the server
 * action, the public cards and the preview.
 *
 * Selection, order and notes are one value. They are saved together by one
 * RPC call, so nothing here treats a note as a separate edit that could land
 * without the selection it belongs to.
 */

/** Mirrored by the CHECK in 20260826000002_featured_work_notes.sql. */
export const FEATURE_NOTE_MAX_LENGTH = 180;

export const FEATURED_WORK_LIMIT = 3;

export const FEATURE_NOTE_PROMPT =
  "Tell visitors what this work demonstrates or why it matters to you.";

export const FEATURE_NOTE_EXAMPLE =
  "This is my most complete analysis of vaccine access in Nigeria.";

export interface FeaturedWorkSelection {
  postId: string;
  /** Trimmed, or null when the author left it empty. */
  note: string | null;
}

/**
 * Collapses whitespace and returns null for an empty note.
 *
 * Plain text only: the value is rendered as a React text node and never as
 * markup, and newlines are removed because the public card gives a note one
 * subordinate line under the title.
 */
export function normalizeFeatureNote(value: string | null | undefined): string | null {
  const collapsed = value?.replace(/\s+/g, " ").trim();
  return collapsed ? collapsed : null;
}

export function getFeatureNoteError(value: string | null | undefined): string | null {
  const normalized = normalizeFeatureNote(value);
  if (!normalized) return null;
  if (normalized.length > FEATURE_NOTE_MAX_LENGTH) {
    return `Keep this to ${FEATURE_NOTE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export interface FeaturedWorkValidation {
  postIds: string[];
  notes: (string | null)[];
  error: string | null;
}

/**
 * The one place selection rules are applied before a save.
 *
 * The RPC re-checks all of this, because a client is not a trust boundary.
 * This exists so the author sees the product's sentence in the form rather
 * than a database error after a round trip.
 */
export function validateFeaturedWorkSelections(
  selections: FeaturedWorkSelection[]
): FeaturedWorkValidation {
  const postIds: string[] = [];
  const notes: (string | null)[] = [];
  const seen = new Set<string>();

  for (const selection of selections) {
    const postId = selection.postId.trim();
    if (!postId) continue;
    if (seen.has(postId)) {
      return {
        postIds: [],
        notes: [],
        error: "Choose each featured publication only once.",
      };
    }
    seen.add(postId);

    const noteError = getFeatureNoteError(selection.note);
    if (noteError) {
      return {
        postIds: [],
        notes: [],
        error: `Keep each featured work note to ${FEATURE_NOTE_MAX_LENGTH} characters or fewer.`,
      };
    }

    postIds.push(postId);
    notes.push(normalizeFeatureNote(selection.note));
  }

  if (postIds.length > FEATURED_WORK_LIMIT) {
    return {
      postIds: [],
      notes: [],
      error: `You can feature up to ${FEATURED_WORK_LIMIT} publications.`,
    };
  }

  return { postIds, notes, error: null };
}

/**
 * How many of the current selections still have no explanation. Drives the
 * "Explain your selection" next action, so it counts only what an author can
 * actually act on.
 */
export function countMissingFeatureNotes(
  selections: Array<{ note: string | null }>
) {
  return selections.filter((selection) => !normalizeFeatureNote(selection.note))
    .length;
}
