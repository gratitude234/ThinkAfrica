/**
 * Field-by-field comparison for the live parity harnesses.
 *
 * Shared rather than copied because the two known-benign spellings are the
 * whole subtlety of these tests. A harness that reconciled timestamps slightly
 * differently from its neighbour would report a difference the other tolerates,
 * or worse, tolerate one the other catches, and the divergence would look like
 * a finding about the database.
 *
 * Not `server-only`: this is test support and never runs in a request.
 */

/** Timestamps: PostgREST returns `+00:00`, a driver returns a Date the mapper
 *  serialises as `Z`. Same instant, different spelling. */
export function sameInstant(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  const left = new Date(a as string).getTime();
  const right = new Date(b as string).getTime();
  return Number.isNaN(left) || Number.isNaN(right)
    ? String(a) === String(b)
    : left === right;
}

export const TIMESTAMP_KEYS = new Set([
  "created_at",
  "published_at",
  "accepted_at",
  "assigned_at",
  "submitted_at",
  "occurred_at",
  "synced_at",
]);

/**
 * Every difference between two results, as readable paths.
 *
 * Returns all of them rather than the first, because a query that is wrong is
 * usually wrong about several fields and seeing them together is what
 * identifies which join went astray.
 */
export function differences(left: unknown, right: unknown, path = ""): string[] {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [`${path}: array on one side only`];
    }
    if (left.length !== right.length) {
      return [`${path}: length ${left.length} vs ${right.length}`];
    }
    return left.flatMap((entry, index) =>
      differences(entry, right[index], `${path}[${index}]`)
    );
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([
      ...Object.keys(left as object),
      ...Object.keys(right as object),
    ]);
    return [...keys].flatMap((key) =>
      differences(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      )
    );
  }

  const key = path.split(".").pop() ?? "";
  if (TIMESTAMP_KEYS.has(key.replace(/\[\d+\]$/, ""))) {
    return sameInstant(left, right) ? [] : [`${path}: ${left} vs ${right}`];
  }

  // `?? null` treats an absent key and an explicit null as the same answer,
  // which is the one difference between the transports that carries no
  // meaning: PostgREST omits nothing, a jsonb_build_object can.
  if ((left ?? null) !== (right ?? null)) {
    return [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`];
  }
  return [];
}

/** Sorted, so an ordering difference in a set-valued result is not reported as
 *  a content difference. Ordering is asserted separately where it matters. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b)
        )
      );
    }
    return entry;
  });
}
