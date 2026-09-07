import {
  getPostAuthor,
  type PostRecord,
  type ProfileIdentityRecord,
} from "@/lib/db/types";

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
  /** What was compared: a post's slug, a profile's username. Named for the
   *  identifier rather than the domain, because the report prints it and a
   *  reader needs to know which row to go and look at. */
  subject: string;
  /** Both adapters resolved the same presence: found, or not found. */
  visibilityMatches: boolean;
  differences: FieldDifference[];
  /** Live counters where Supabase is ahead of the snapshot. Reported, not
   *  failed: production kept serving readers after the copy was taken. */
  drift: FieldDifference[];
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

/**
 * Counters that production increments while the comparison is running.
 *
 * `view_count`, `impression_count` and `read_count` are written by real
 * readers browsing the live site. The Neon copy is a snapshot; Supabase keeps
 * moving. A parity run therefore sees Supabase ahead by however many people
 * read that post since the copy, which is not a defect and cannot be removed
 * by taking a better snapshot of a site that is still serving.
 *
 * They are still compared, in the two ways that can catch a real bug:
 *
 *   - **Type.** A counter arriving as the string "62" rather than the number
 *     62 is exactly the class of bug this migration has already hit twice, so
 *     both sides are normalised and a non-numeric value fails.
 *   - **Direction.** The snapshot cannot be *ahead* of the source. Neon
 *     exceeding Supabase means something wrote to the copy, or the mapping is
 *     wrong, and that fails.
 *
 * A Supabase-ahead gap is reported as drift so it stays visible, rather than
 * being silently dropped. `current_round` and `document_size_bytes` are not
 * reader-driven and are compared exactly.
 */
const LIVE_COUNTER_FIELDS = new Set<string>([
  "view_count",
  "impression_count",
  "read_count",
]);

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
  const drift: FieldDifference[] = [];

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
      if (left === right) continue;

      // A value that would not normalise to a number is a mapping bug on
      // either side, whatever the field.
      const unparseable =
        (supabase[field] !== null && supabase[field] !== undefined && left === null) ||
        (postgres[field] !== null && postgres[field] !== undefined && right === null);

      if (!unparseable && LIVE_COUNTER_FIELDS.has(field)) {
        // The snapshot cannot legitimately be ahead of the source.
        if (right !== null && left !== null && right > left) {
          differences.push({ field, supabase: left, postgres: right });
        } else {
          drift.push({ field, supabase: left, postgres: right });
        }
        continue;
      }

      differences.push({ field, supabase: left, postgres: right });
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
    subject: slug,
    visibilityMatches,
    differences,
    drift,
    get matches() {
      return differences.length === 0;
    },
  };
}

/**
 * The same comparison for a profile row.
 *
 * Separate from the post comparison rather than generic over both, because
 * what counts as an acceptable difference is domain knowledge, not a type
 * parameter. Three rules that are specific to this row:
 *
 *   - **No live counters.** Nothing on a profile is incremented by readers
 *     browsing the site, so there is no legitimate drift and every difference
 *     is a difference. `drift` is returned empty rather than omitted, so one
 *     report format covers both domains.
 *   - **An empty `interests` and a NULL one are different answers**, meaning
 *     "chose no topics" and "never answered". The profile page renders them
 *     differently, so unlike `posts.tags` they are not flattened together.
 *   - **`positioning_statement` is compared by presence as well as by value.**
 *     Both adapters gate the column on the same flag, so one side carrying the
 *     key while the other omits it means the gate is being read differently in
 *     two places, which is a real defect even when the value is null.
 */

const PROFILE_SCALAR_FIELDS = [
  "id",
  "username",
  "full_name",
  "country",
  "university",
  "field_of_study",
  "bio",
  "avatar_url",
  "cover_image_url",
  "verified_type",
  "profile_type",
  "professional_title",
  "organization_name",
  "organization_website",
] as const satisfies readonly (keyof ProfileIdentityRecord)[];

/** Compared strictly. A driver handing back "t" instead of true would put a
 *  verification badge on an unverified member, so `"t" !== true` failing is
 *  the point rather than something to normalise away. */
const PROFILE_BOOLEAN_FIELDS = [
  "is_alumni",
  "verified",
] as const satisfies readonly (keyof ProfileIdentityRecord)[];

/** Null and empty stay distinct here. See the note above. */
function sameNullableArray(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a ?? null) === (b ?? null);
  }
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function compareProfileRecords(
  username: string,
  supabase: ProfileIdentityRecord | null,
  postgres: ProfileIdentityRecord | null
): ParityResult {
  const differences: FieldDifference[] = [];

  const visibilityMatches = (supabase === null) === (postgres === null);
  if (!visibilityMatches) {
    differences.push({
      field: "(resolved)",
      supabase: supabase === null ? "not found" : "found",
      postgres: postgres === null ? "not found" : "found",
    });
  }

  if (supabase && postgres) {
    for (const field of PROFILE_SCALAR_FIELDS) {
      const left = supabase[field] ?? null;
      const right = postgres[field] ?? null;
      if (left !== right) differences.push({ field, supabase: left, postgres: right });
    }

    for (const field of PROFILE_BOOLEAN_FIELDS) {
      if (supabase[field] !== postgres[field]) {
        differences.push({
          field,
          supabase: supabase[field],
          postgres: postgres[field],
        });
      }
    }

    const leftYear = counter(supabase.graduation_year);
    const rightYear = counter(postgres.graduation_year);
    if (leftYear !== rightYear) {
      differences.push({
        field: "graduation_year",
        supabase: leftYear,
        postgres: rightYear,
      });
    }

    if (!sameNullableArray(supabase.interests, postgres.interests)) {
      differences.push({
        field: "interests",
        supabase: supabase.interests,
        postgres: postgres.interests,
      });
    }

    const leftHasPositioning = "positioning_statement" in supabase;
    const rightHasPositioning = "positioning_statement" in postgres;
    if (leftHasPositioning !== rightHasPositioning) {
      differences.push({
        field: "positioning_statement (presence)",
        supabase: leftHasPositioning ? "selected" : "not selected",
        postgres: rightHasPositioning ? "selected" : "not selected",
      });
    } else if (
      leftHasPositioning &&
      (supabase.positioning_statement ?? null) !==
        (postgres.positioning_statement ?? null)
    ) {
      differences.push({
        field: "positioning_statement",
        supabase: supabase.positioning_statement ?? null,
        postgres: postgres.positioning_statement ?? null,
      });
    }
  }

  return {
    subject: username,
    visibilityMatches,
    differences,
    drift: [],
    get matches() {
      return differences.length === 0;
    },
  };
}

/** A short report, for a script's stdout and for a failing test's message. */
export function formatParityReport(results: ParityResult[]): string {
  const failed = results.filter((result) => !result.matches);
  const drifted = results.filter((result) => result.drift.length > 0);
  const lines = [
    `${results.length - failed.length}/${results.length} subjects match across adapters.`,
  ];

  if (drifted.length > 0) {
    // Not a failure, and not hidden either: production served readers while
    // the comparison ran, so the source is ahead of the snapshot.
    lines.push("");
    lines.push(`${drifted.length} with live-counter drift (Supabase ahead, expected):`);
    for (const result of drifted) {
      for (const entry of result.drift) {
        lines.push(
          `    ${result.subject} ${entry.field}: ${entry.supabase} vs ${entry.postgres}`
        );
      }
    }
  }

  for (const result of failed) {
    lines.push(`\n  ${result.subject}`);
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
