import { getPostAuthor, type PostRecord } from "@/lib/db/types";

/**
 * Field-by-field comparison of what the two adapters return for the same post.
 *
 * The adapters are swappable only if a caller cannot tell which one answered,
 * and "cannot tell" has to mean something more precise than "looks right in a
 * browser". This is that definition, written once and used twice: by
 * lib/db/parity.test.ts against constructed rows, and by
 * scripts/migration/parity-check.mjs against two live databases.
 *
 * Deliberately not `expect(a).toEqual(b)`. Two differences are expected and
 * must not be reported as failures:
 *
 *   - **The embedded author's shape.** PostgREST returns a one-to-one embed as
 *     either an object or a single-element array depending on how it resolves
 *     the relationship. The SQL adapter always builds an object. Every caller
 *     goes through `getPostAuthor`, so the comparison does too.
 *   - **Timestamp spelling.** PostgREST returns `2026-09-01T10:00:00+00:00`;
 *     a driver returns a `Date` that the mapper serialises as
 *     `2026-09-01T10:00:00.000Z`. Those are the same instant, and comparing
 *     the strings would report a difference that does not exist.
 *
 * Anything else is a real difference and is returned.
 */

const TIMESTAMP_FIELDS = [
  "created_at",
  "published_at",
  "revision_due_at",
] as const satisfies readonly (keyof PostRecord)[];

const AUTHOR_FIELDS = [
  "id",
  "username",
  "full_name",
  "university",
  "field_of_study",
  "bio",
  "avatar_url",
  "verified",
  "verified_type",
] as const;

export interface FieldDifference {
  field: string;
  supabase: unknown;
  postgres: unknown;
}

export interface ParityResult {
  slug: string;
  /** Both adapters resolved the same presence: found, or not found. */
  visibilityMatches: boolean;
  differences: FieldDifference[];
  get matches(): boolean;
}

/** Same instant, whatever the spelling. Returns null for an absent value and
 *  the original string for one that cannot be parsed, so a malformed
 *  timestamp is reported rather than silently equal to every other one. */
function instant(value: unknown): string | null | unknown {
  if (value === null || value === undefined) return null;
  const parsed = new Date(value as string | Date);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

/** int8 arrives as a string from most drivers and as a number from PostgREST.
 *  A counter of 12 is a counter of 12. */
function counter(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const COUNTER_FIELDS = [
  "view_count",
  "impression_count",
  "read_count",
  "current_round",
  "document_size_bytes",
] as const satisfies readonly (keyof PostRecord)[];

const SCALAR_FIELDS = [
  "id",
  "title",
  "slug",
  "content",
  "excerpt",
  "type",
  "content_kind",
  "article_format",
  "status",
  "author_id",
  "cover_image_url",
  "citation_id",
  "published_version_id",
  "in_response_to",
  "audio_summary_url",
  "document_path",
  "document_original_name",
  "document_mime_type",
] as const satisfies readonly (keyof PostRecord)[];

function sameArray(a: unknown, b: unknown): boolean {
  const left = Array.isArray(a) ? a : a === null || a === undefined ? [] : [a];
  const right = Array.isArray(b) ? b : b === null || b === undefined ? [] : [b];
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function comparePostRecords(
  slug: string,
  supabase: PostRecord | null,
  postgres: PostRecord | null
): ParityResult {
  const differences: FieldDifference[] = [];

  // Presence is the first and most important comparison: a slug that resolves
  // under one adapter and not the other is a visibility difference, which is
  // the failure mode that would leak or hide a draft.
  const visibilityMatches = (supabase === null) === (postgres === null);
  if (!visibilityMatches) {
    differences.push({
      field: "(resolved)",
      supabase: supabase === null ? "not found" : "found",
      postgres: postgres === null ? "not found" : "found",
    });
  }

  if (supabase && postgres) {
    for (const field of SCALAR_FIELDS) {
      const left = supabase[field] ?? null;
      const right = postgres[field] ?? null;
      if (left !== right) differences.push({ field, supabase: left, postgres: right });
    }

    for (const field of COUNTER_FIELDS) {
      const left = counter(supabase[field]);
      const right = counter(postgres[field]);
      if (left !== right) differences.push({ field, supabase: left, postgres: right });
    }

    for (const field of TIMESTAMP_FIELDS) {
      const left = instant(supabase[field]);
      const right = instant(postgres[field]);
      if (left !== right) differences.push({ field, supabase: left, postgres: right });
    }

    if (!sameArray(supabase.tags, postgres.tags)) {
      differences.push({ field: "tags", supabase: supabase.tags, postgres: postgres.tags });
    }

    const leftAuthor = getPostAuthor(supabase);
    const rightAuthor = getPostAuthor(postgres);
    if ((leftAuthor === null) !== (rightAuthor === null)) {
      differences.push({
        field: "profiles",
        supabase: leftAuthor === null ? null : "present",
        postgres: rightAuthor === null ? null : "present",
      });
    } else if (leftAuthor && rightAuthor) {
      for (const field of AUTHOR_FIELDS) {
        const left = leftAuthor[field] ?? null;
        const right = rightAuthor[field] ?? null;
        if (left !== right) {
          differences.push({ field: `profiles.${field}`, supabase: left, postgres: right });
        }
      }
    }
  }

  return {
    slug,
    visibilityMatches,
    differences,
    get matches() {
      return differences.length === 0;
    },
  };
}

/** A short report, for a script's stdout and for a failing test's message. */
export function formatParityReport(results: ParityResult[]): string {
  const failed = results.filter((result) => !result.matches);
  const lines = [
    `${results.length - failed.length}/${results.length} slugs match across adapters.`,
  ];

  for (const result of failed) {
    lines.push(`\n  ${result.slug}`);
    for (const difference of result.differences) {
      lines.push(
        `    ${difference.field}: supabase=${JSON.stringify(
          difference.supabase
        )} postgres=${JSON.stringify(difference.postgres)}`
      );
    }
  }

  return lines.join("\n");
}
