/**
 * Query normalisation and the PostgREST filter encoding, as a leaf module.
 *
 * Split out of `lib/searchData.ts` so that `lib/db/search.ts` can use the same
 * escaping without importing the loader that imports the adapter that imports
 * it. One definition, no cycle. `lib/searchData.ts` re-exports all four names,
 * so nothing that already imported them has to change.
 *
 * Not `server-only`: these are pure string functions with no I/O.
 */

/** Longer than any real search, short enough that a pathological pattern is
 *  not worth the database's time. Trimmed to this rather than rejected: a
 *  paste of a paragraph should search for the paragraph's start. */
export const MAX_SEARCH_QUERY_LENGTH = 100;

/**
 * A user's text, as a LIKE pattern that matches it literally.
 *
 * `%` and `_` are LIKE wildcards. Unescaped, a search for `100%` matches every
 * row, and a search for `a_b` matches `axb`. The backslash goes first, because
 * escaping it after the others would escape the escapes.
 *
 * This layer is the one PostgreSQL reads, so it applies to a bound parameter
 * on a direct connection exactly as it applied inside a PostgREST filter.
 */
export function escapeLikeFragment(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** The pattern both transports match on: contains, case-insensitively. */
export function likeContainsPattern(raw: string): string {
  return `%${escapeLikeFragment(raw)}%`;
}

/**
 * One or more columns, ILIKE the same pattern, as a PostgREST `or` filter.
 *
 * The value is double-quoted, which is how PostgREST is told that a comma, a
 * parenthesis or a dot inside it is data rather than grammar. Inside those
 * quotes a backslash or a double quote is escaped with a backslash, which is
 * why the LIKE escaping above is applied first and then escaped again here:
 * PostgREST removes one layer, and Postgres sees the layer that was meant for
 * it.
 *
 * The second layer exists only because of the transport. A direct connection
 * binds the pattern as a parameter and needs the first layer alone.
 */
export function orIlikeFilter(columns: readonly string[], raw: string): string {
  const pattern = likeContainsPattern(raw);
  const quoted = pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return columns.map((column) => `${column}.ilike."${quoted}"`).join(",");
}

/** Trimmed, capped, and rejected outright when empty. Every entry point uses
 *  this, so none of them can disagree about what an empty search is. */
export function normalizeSearchQuery(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH);
}
