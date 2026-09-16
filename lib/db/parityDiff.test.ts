import { describe, expect, it } from "vitest";

import { differences, sameInstant } from "@/lib/db/parityDiff";

/**
 * The parity harnesses only run when both databases are reachable, so the
 * comparison they depend on would otherwise be the one piece of the migration
 * with no coverage at all. A helper that quietly reported "no differences" for
 * everything would make every parity run pass.
 */

describe("sameInstant", () => {
  it("accepts the two spellings the transports produce", () => {
    expect(sameInstant("2026-09-08T07:00:00+00:00", "2026-09-08T07:00:00.000Z")).toBe(
      true
    );
  });

  it("does not accept a different instant", () => {
    expect(sameInstant("2026-09-08T07:00:00Z", "2026-09-08T07:00:01Z")).toBe(false);
  });

  it("treats null and undefined as the same absence, and absence as unequal to a value", () => {
    expect(sameInstant(null, undefined)).toBe(true);
    expect(sameInstant(null, "2026-09-08T07:00:00Z")).toBe(false);
    expect(sameInstant("2026-09-08T07:00:00Z", null)).toBe(false);
  });

  it("falls back to string equality when neither side parses", () => {
    expect(sameInstant("not a date", "not a date")).toBe(true);
    expect(sameInstant("not a date", "also not")).toBe(false);
  });
});

describe("differences", () => {
  it("reports nothing for identical objects", () => {
    expect(differences({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual([]);
  });

  it("reports a changed scalar with its path", () => {
    expect(differences({ a: { b: 1 } }, { a: { b: 2 } })).toEqual(["a.b: 1 vs 2"]);
  });

  it("reports every difference, not just the first", () => {
    expect(differences({ a: 1, b: 2 }, { a: 9, b: 8 })).toHaveLength(2);
  });

  it("treats an absent key and an explicit null as the same answer", () => {
    expect(differences({ a: 1 }, { a: 1, b: null })).toEqual([]);
  });

  it("does not treat an absent key and a value as the same answer", () => {
    expect(differences({ a: 1 }, { a: 1, b: 0 })).toEqual(["b: undefined vs 0"]);
  });

  it("reconciles timestamp spellings only on timestamp keys", () => {
    expect(
      differences(
        { created_at: "2026-09-08T07:00:00+00:00" },
        { created_at: "2026-09-08T07:00:00.000Z" }
      )
    ).toEqual([]);

    // The same two strings under a key that is not a timestamp are two
    // different strings, because the leniency is about a known encoding
    // difference and not about dates in general.
    const other = differences(
      { slug: "2026-09-08T07:00:00+00:00" },
      { slug: "2026-09-08T07:00:00.000Z" }
    );
    expect(other).toHaveLength(1);
  });

  it("reports a length mismatch rather than comparing past the shorter array", () => {
    expect(differences([1, 2], [1])).toEqual([": length 2 vs 1"]);
  });

  it("reports an array against an object", () => {
    expect(differences([1], { 0: 1 })).toEqual([": array on one side only"]);
  });

  it("descends into arrays of objects", () => {
    expect(
      differences([{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "c" }])
    ).toEqual(['[1].id: "b" vs "c"']);
  });

  it("distinguishes a zero from a null", () => {
    // The one that matters most for counts: a repository returning null where
    // the other returns 0 renders as an empty state rather than a zero.
    expect(differences({ n: 0 }, { n: null })).toEqual(["n: 0 vs null"]);
  });
});
