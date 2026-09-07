import { describe, expect, it } from "vitest";

import {
  toBoolean,
  toJsonObject,
  toNumber,
  toStringArray,
  toTimestampString,
  toUuid,
} from "@/lib/db/postgres/normalise";

/**
 * The driver boundary, tested against every form a value is known to arrive
 * in: from PostgREST, from postgres.js with type information, and from
 * postgres.js with `fetch_types: false`, which is how this application runs.
 *
 * Both Phase 3 production failures were here, in opposite directions, and
 * neither was caught by a type: TypeScript believed `tags` was `string[]`
 * while the driver was handing over the string `{a,b}`, so the first `.map()`
 * in a component threw inside a Suspense boundary and the page still answered
 * 200. These cases are the regression net for that class, so a change to the
 * pool options cannot reintroduce it silently.
 */

describe("toStringArray", () => {
  it("passes a real array through", () => {
    expect(toStringArray(["governance", "policy"])).toEqual([
      "governance",
      "policy",
    ]);
  });

  it("keeps an empty array and a NULL column distinct", () => {
    // For profiles.interests these mean "chose no topics" and "never
    // answered", and the profile page renders them differently.
    expect(toStringArray([])).toEqual([]);
    expect(toStringArray(null)).toBeNull();
    expect(toStringArray(undefined)).toBeNull();
  });

  it("parses the array literal an untyped driver produces", () => {
    expect(toStringArray("{governance,policy}")).toEqual([
      "governance",
      "policy",
    ]);
  });

  it("parses the empty array literal as empty, not as one blank entry", () => {
    expect(toStringArray("{}")).toEqual([]);
    expect(toStringArray("")).toEqual([]);
  });

  it("parses a single-element literal", () => {
    expect(toStringArray("{governance}")).toEqual(["governance"]);
  });

  it("respects quoting around an element containing a comma", () => {
    expect(toStringArray('{"policy, law",governance}')).toEqual([
      "policy, law",
      "governance",
    ]);
  });

  it("unescapes a quoted element containing a quote or a backslash", () => {
    expect(toStringArray('{"say \\"yes\\"",b}')).toEqual(['say "yes"', "b"]);
    expect(toStringArray('{"a\\\\b"}')).toEqual(["a\\b"]);
  });

  it("treats a bare string as a one-element array rather than dropping it", () => {
    expect(toStringArray("governance")).toEqual(["governance"]);
  });

  it("never returns a string, whatever it was given", () => {
    // The only property a caller actually depends on: it can always `.map()`.
    for (const input of [null, [], ["a"], "{}", "{a,b}", "a", 7, {}]) {
      const result = toStringArray(input);
      expect(result === null || Array.isArray(result)).toBe(true);
    }
  });
});

describe("toJsonObject", () => {
  it("passes a parsed object through", () => {
    expect(toJsonObject({ id: "author-1" })).toEqual({ id: "author-1" });
  });

  it("keeps an empty object and a NULL column distinct", () => {
    expect(toJsonObject({})).toEqual({});
    expect(toJsonObject(null)).toBeNull();
    expect(toJsonObject(undefined)).toBeNull();
  });

  it("parses the string form a json column can arrive as", () => {
    expect(toJsonObject('{"id":"author-1"}')).toEqual({ id: "author-1" });
    expect(toJsonObject("{}")).toEqual({});
  });

  it("returns null for malformed json rather than throwing inside a render", () => {
    expect(toJsonObject("{not json")).toBeNull();
  });

  it("returns null for a json array, which is not an object", () => {
    expect(toJsonObject([1, 2])).toBeNull();
    expect(toJsonObject("[1,2]")).toBeNull();
  });
});

describe("toTimestampString", () => {
  it("converts a Date to the ISO string PostgREST would have sent", () => {
    expect(toTimestampString(new Date("2026-09-02T10:00:00.000Z"))).toBe(
      "2026-09-02T10:00:00.000Z"
    );
  });

  it("passes an existing string through", () => {
    expect(toTimestampString("2026-09-02T10:00:00+00:00")).toBe(
      "2026-09-02T10:00:00+00:00"
    );
  });

  it("keeps a null timestamp null instead of inventing now", () => {
    expect(toTimestampString(null)).toBeNull();
    expect(toTimestampString(undefined)).toBeNull();
  });
});

describe("toNumber", () => {
  it("parses the string form an int8 arrives as", () => {
    expect(toNumber("12")).toBe(12);
  });

  it("passes a number through", () => {
    expect(toNumber(40)).toBe(40);
  });

  it("keeps zero as zero rather than as absent", () => {
    expect(toNumber(0)).toBe(0);
    expect(toNumber("0")).toBe(0);
  });

  it("returns null for null and for anything unparseable", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("not a number")).toBeNull();
  });
});

describe("toBoolean", () => {
  it("passes booleans through", () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false)).toBe(false);
  });

  it("reads the text forms an untyped driver produces", () => {
    expect(toBoolean("t")).toBe(true);
    expect(toBoolean("f")).toBe(false);
    expect(toBoolean("true")).toBe(true);
    expect(toBoolean("false")).toBe(false);
  });

  it("falls back rather than making an unknown value true", () => {
    // `verified` is the column this matters for: defaulting an unreadable
    // value to true would put a verification badge on an unverified member.
    expect(toBoolean(null)).toBe(false);
    expect(toBoolean("maybe")).toBe(false);
    expect(toBoolean(null, true)).toBe(true);
  });
});

describe("toUuid", () => {
  it("returns the text form and keeps null null", () => {
    expect(toUuid("2f1c8a4e-0000-4000-8000-000000000000")).toBe(
      "2f1c8a4e-0000-4000-8000-000000000000"
    );
    expect(toUuid(null)).toBeNull();
    expect(toUuid(undefined)).toBeNull();
  });
});
