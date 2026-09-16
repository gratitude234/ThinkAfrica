/**
 * Turning what a PostgreSQL driver hands back into what the application was
 * promised.
 *
 * Shared by every repository in lib/db/postgres, because the mismatches are
 * not per-table: they come from the driver's configuration, so they apply
 * everywhere the same way.
 *
 * ## Why this file exists at all
 *
 * `lib/db/postgres/connection.ts` sets `fetch_types: false`, which is
 * Cloudflare's recommendation for Hyperdrive and saves a round trip on every
 * cold isolate. The cost is that postgres.js never learns the server's type
 * OIDs, and without them it cannot parse a composite result any more than it
 * can serialise a composite parameter.
 *
 * Phase 3 hit that twice, in both directions, and both times the failure
 * reached a running application before anything caught it:
 *
 *   - An array *parameter* was sent as `a,b,c` and rejected as a malformed
 *     array literal, so every post page returned 500.
 *   - An array *result* came back as the string `{a,b}`, a component called
 *     `.map()` on it, and the article body failed inside a Suspense boundary
 *     on a page that still answered 200.
 *
 * The queries avoid the problem where they can, by selecting `to_jsonb(...)`
 * for array columns: jsonb is built in, so postgres.js parses it with no OID
 * lookup. These functions are the second line, so a future change to the
 * driver options cannot silently reintroduce either failure. Every one of them
 * accepts what PostgREST produces, what postgres.js produces with types, and
 * what postgres.js produces without them.
 */

/** A driver may return a Date, a string, or null for a timestamptz. Callers
 *  were promised the ISO string PostgREST gave them. */
export function toTimestampString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * int8 arrives as a string from most drivers, to avoid a lossy Number cast the
 * driver cannot know is safe. Every column this is used on is a counter, a
 * year or a byte size, all of which fit.
 */
export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Postgres booleans arrive as booleans from both providers, but a `t`/`f`
 *  text form is what a driver with no type information would produce. */
export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return fallback;
  if (value === "t" || value === "true" || value === 1) return true;
  if (value === "f" || value === "false" || value === 0) return false;
  return fallback;
}

/**
 * A `text[]` column, however the driver chose to hand it over.
 *
 * Returns an array or null, never a string, so a caller can always `.map()`.
 * An empty array and a NULL column are kept distinct: for `profiles.interests`
 * they mean "chose no topics" and "never answered", which the profile page
 * renders differently.
 */
export function toStringArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "{}") return [];
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [trimmed];

  // A PostgreSQL array literal: braces, comma separated, quotes around any
  // element containing a comma, a brace, a quote or whitespace.
  const inner = trimmed.slice(1, -1);
  const items: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of inner) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      items.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  items.push(current);

  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

/**
 * A `jsonb` column.
 *
 * Both providers parse jsonb, so this is mostly a type narrowing. It still
 * handles the string form, because a `json` column selected through a driver
 * with no type information arrives unparsed, and because a malformed value
 * should become null rather than throwing inside a render.
 *
 * An empty object and a NULL column stay distinct, for the same reason arrays
 * do: `{}` is "saved nothing", NULL is "never saved".
 */
export function toJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** A uuid is text on the wire from every driver. Kept as a named function so
 *  a column's intent is readable at the call site. */
export function toUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}
