import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { comparePostRecords, compareProfileRecords, formatParityReport } =
  await import("@/lib/db/parity");
const { toPostRecord } = await import("@/lib/db/postgres/posts");
const { getPostAuthor } = await import("@/lib/db/types");

/**
 * Adapter parity, without a database.
 *
 * scripts/migration/parity-check.mjs runs the same comparison against two live
 * databases and is the acceptance gate for pointing a domain at Neon. This
 * file is what can run in CI: it takes one logical post, expresses it the way
 * each provider would hand it back, and asserts a caller cannot tell the
 * difference.
 *
 * The two shapes are not hypothetical. They are the four places where a
 * faithful port is not the obvious one, listed in lib/db/postgres/posts.ts.
 */

/** One post, as PostgREST returns it: ISO strings with a numeric offset,
 *  numbers for int8, and a one-to-one embed that may be an array. */
const postgrestRow = {
  id: "post-1",
  title: "Solar microgrids in Jos",
  slug: "solar-microgrids-in-jos",
  content: "<p>body</p>",
  excerpt: "An excerpt",
  type: "essay",
  content_kind: "article",
  article_format: null,
  tags: ["energy", "nigeria"],
  status: "published",
  author_id: "author-1",
  created_at: "2026-09-01T10:00:00+00:00",
  published_at: "2026-09-02T08:30:00+00:00",
  view_count: 12,
  impression_count: 340,
  read_count: null,
  cover_image_url: null,
  citation_id: "INDEGENIUS-2026-0001",
  published_version_id: "version-1",
  current_round: 2,
  revision_due_at: null,
  in_response_to: null,
  audio_summary_url: null,
  document_path: null,
  document_original_name: null,
  document_mime_type: null,
  document_size_bytes: 2048,
  profiles: [
    {
      id: "author-1",
      username: "ada",
      full_name: "Ada Lovelace",
      university: "University of Jos",
      field_of_study: "Energy Systems",
      bio: null,
      avatar_url: null,
      verified: true,
      verified_type: "student",
    },
  ],
};

/** The same post, as postgres.js returns it: Date objects, int8 as strings,
 *  and the author built by jsonb_build_object. */
const sqlRow = {
  ...postgrestRow,
  created_at: new Date("2026-09-01T10:00:00.000Z"),
  published_at: new Date("2026-09-02T08:30:00.000Z"),
  view_count: "12",
  impression_count: "340",
  document_size_bytes: "2048",
  profiles: {
    id: "author-1",
    username: "ada",
    full_name: "Ada Lovelace",
    university: "University of Jos",
    field_of_study: "Energy Systems",
    bio: null,
    avatar_url: null,
    verified: true,
    verified_type: "student",
  },
};

const supabaseRecord = postgrestRow as never;

describe("adapter parity for one post", () => {
  it("finds no difference between the two providers' shapes", () => {
    const result = comparePostRecords(
      postgrestRow.slug,
      supabaseRecord,
      toPostRecord(sqlRow)
    );

    expect(result.differences).toEqual([]);
    expect(result.matches).toBe(true);
    expect(result.visibilityMatches).toBe(true);
  });

  it("treats an embedded author as equal whether it arrives boxed or not", () => {
    // PostgREST returns a one-to-one embed either way depending on how it
    // resolves the relationship, which is why every caller goes through
    // getPostAuthor and why this comparison does too.
    const asObject = { ...postgrestRow, profiles: postgrestRow.profiles[0] } as never;
    const result = comparePostRecords("s", asObject, toPostRecord(sqlRow));

    expect(result.differences).toEqual([]);
    expect(getPostAuthor(asObject)).toEqual(getPostAuthor(toPostRecord(sqlRow)));
  });

  it("treats the same instant spelled two ways as equal", () => {
    const withOffset = { ...postgrestRow, created_at: "2026-09-01T11:00:00+01:00" } as never;
    const result = comparePostRecords("s", withOffset, toPostRecord(sqlRow));
    expect(result.differences).toEqual([]);
  });

  it("treats a counter as equal whether it is a number or a string", () => {
    const result = comparePostRecords(
      "s",
      { ...postgrestRow, view_count: 12 } as never,
      toPostRecord({ ...sqlRow, view_count: "12" })
    );
    expect(result.differences).toEqual([]);
  });
});

describe("the differences it does report", () => {
  it("reports a visibility difference first, and loudest", () => {
    // A slug that resolves under one adapter and not the other is the failure
    // that would leak or hide a draft. It is the reason this harness exists.
    const result = comparePostRecords("a-draft", supabaseRecord, null);

    expect(result.visibilityMatches).toBe(false);
    expect(result.differences[0]).toEqual({
      field: "(resolved)",
      supabase: "found",
      postgres: "not found",
    });
  });

  it("says nothing when neither adapter resolves the slug", () => {
    const result = comparePostRecords("no-such-post", null, null);
    expect(result.matches).toBe(true);
    expect(result.visibilityMatches).toBe(true);
  });

  it("reports a changed scalar", () => {
    const result = comparePostRecords(
      "s",
      supabaseRecord,
      toPostRecord({ ...sqlRow, status: "draft" })
    );
    expect(result.differences).toEqual([
      { field: "status", supabase: "published", postgres: "draft" },
    ]);
  });

  it("reports a dropped author, which an inner join would cause", () => {
    const result = comparePostRecords(
      "s",
      supabaseRecord,
      toPostRecord({ ...sqlRow, profiles: null })
    );
    expect(result.differences).toEqual([
      { field: "profiles", supabase: "present", postgres: null },
    ]);
  });

  it("reports a changed author field", () => {
    const result = comparePostRecords(
      "s",
      supabaseRecord,
      toPostRecord({
        ...sqlRow,
        profiles: { ...sqlRow.profiles, username: "someone-else" },
      })
    );
    expect(result.differences).toEqual([
      { field: "profiles.username", supabase: "ada", postgres: "someone-else" },
    ]);
  });

  it("reports reordered or missing tags", () => {
    const result = comparePostRecords(
      "s",
      supabaseRecord,
      toPostRecord({ ...sqlRow, tags: ["nigeria", "energy"] })
    );
    expect(result.differences.map((d) => d.field)).toEqual(["tags"]);
  });

  it("does not treat an unparseable timestamp as equal to everything", () => {
    const result = comparePostRecords(
      "s",
      { ...postgrestRow, created_at: "not a date" } as never,
      toPostRecord(sqlRow)
    );
    expect(result.differences.map((d) => d.field)).toEqual(["created_at"]);
  });
});

describe("formatParityReport", () => {
  it("counts matches and names every difference", () => {
    const report = formatParityReport([
      comparePostRecords("a", supabaseRecord, toPostRecord(sqlRow)),
      comparePostRecords("b", supabaseRecord, null),
    ]);

    expect(report).toContain("1/2 subjects match");
    expect(report).toContain("b");
    expect(report).toContain("(resolved)");
  });
});

describe("live counters", () => {
  /** The counters real readers increment while a comparison is running. */
  const LIVE = ["view_count", "impression_count", "read_count"] as const;

  it("does not fail when Supabase is ahead: the copy is a snapshot", () => {
    for (const field of LIVE) {
      const result = comparePostRecords(
        "s",
        { ...postgrestRow, [field]: 62 } as never,
        toPostRecord({ ...sqlRow, [field]: 61 })
      );
      expect(result.matches, field).toBe(true);
      expect(result.drift.map((d) => d.field)).toEqual([field]);
    }
  });

  it("does fail when the snapshot is ahead, which cannot happen from drift", () => {
    // Neon exceeding Supabase means something wrote to the copy, or the
    // mapping is wrong. Either is a real finding.
    const result = comparePostRecords(
      "s",
      { ...postgrestRow, view_count: 10 } as never,
      toPostRecord({ ...sqlRow, view_count: 11 })
    );
    expect(result.matches).toBe(false);
    expect(result.differences.map((d) => d.field)).toEqual(["view_count"]);
  });

  it("still catches a counter that is not a number", () => {
    // The string-vs-number bug this migration has already hit twice must not
    // be excused as drift.
    const result = comparePostRecords(
      "s",
      { ...postgrestRow, view_count: "not a number" } as never,
      toPostRecord(sqlRow)
    );
    expect(result.matches).toBe(false);
    expect(result.differences.map((d) => d.field)).toEqual(["view_count"]);
  });

  it("compares counters production does not move exactly", () => {
    // current_round is editorial, document_size_bytes is a file property.
    // Neither changes because somebody read the page.
    const result = comparePostRecords(
      "s",
      { ...postgrestRow, current_round: 2 } as never,
      toPostRecord({ ...sqlRow, current_round: 1 })
    );
    expect(result.matches).toBe(false);
    expect(result.drift).toEqual([]);
  });

  it("reports drift in the formatted report rather than hiding it", () => {
    const report = formatParityReport([
      comparePostRecords(
        "a",
        { ...postgrestRow, view_count: 99 } as never,
        toPostRecord(sqlRow)
      ),
    ]);
    expect(report).toContain("1/1 subjects match");
    expect(report).toContain("live-counter drift");
    expect(report).toContain("view_count");
  });
});

describe("compareProfileRecords", () => {
  const supabaseProfile = {
    id: "author-1",
    username: "student1",
    full_name: "A Student",
    country: "Nigeria",
    university: "University of Lagos",
    field_of_study: "Political Science",
    graduation_year: 2028,
    is_alumni: false,
    bio: null,
    avatar_url: null,
    cover_image_url: null,
    verified: true,
    verified_type: "institution",
    interests: ["governance"],
    profile_type: "student",
    professional_title: null,
    organization_name: null,
    organization_website: null,
  };

  it("matches when the two adapters answered the same", () => {
    const result = compareProfileRecords("student1", supabaseProfile, {
      ...supabaseProfile,
    });
    expect(result.matches).toBe(true);
    expect(result.visibilityMatches).toBe(true);
    expect(result.subject).toBe("student1");
  });

  it("reports a username one adapter resolved and the other did not", () => {
    // The failure mode that would show a profile to somebody it is hidden from,
    // or hide one that should be public.
    const result = compareProfileRecords("student1", supabaseProfile, null);
    expect(result.visibilityMatches).toBe(false);
    expect(result.differences[0].field).toBe("(resolved)");
  });

  it("agrees that a nonexistent username is nonexistent on both sides", () => {
    const result = compareProfileRecords("nobody", null, null);
    expect(result.matches).toBe(true);
    expect(result.visibilityMatches).toBe(true);
  });

  it("accepts the year as a number or as the string a driver sends", () => {
    const result = compareProfileRecords("student1", supabaseProfile, {
      ...supabaseProfile,
      graduation_year: "2028" as unknown as number,
    });
    expect(result.matches).toBe(true);
  });

  it("fails a boolean that arrived as text", () => {
    // Not normalised away: "t" reaching a caller means the mapper is not doing
    // its job, and `verified` decides whether a badge is rendered.
    const result = compareProfileRecords("student1", supabaseProfile, {
      ...supabaseProfile,
      verified: "t" as unknown as boolean,
    });
    expect(result.matches).toBe(false);
    expect(result.differences.map((entry) => entry.field)).toContain("verified");
  });

  it("keeps no interests and never answered apart", () => {
    const chose = compareProfileRecords("student1", { ...supabaseProfile, interests: [] }, {
      ...supabaseProfile,
      interests: null,
    });
    expect(chose.matches).toBe(false);
    expect(chose.differences.map((entry) => entry.field)).toContain("interests");
  });

  it("fails an interests array that arrived as the literal string", () => {
    const result = compareProfileRecords("student1", supabaseProfile, {
      ...supabaseProfile,
      interests: "{governance}" as unknown as string[],
    });
    expect(result.matches).toBe(false);
  });

  it("fails when one side selected the positioning column and the other did not", () => {
    // Same flag, read in two places. A null value on one side and no key on the
    // other is the shape of that bug.
    const result = compareProfileRecords(
      "student1",
      { ...supabaseProfile, positioning_statement: null },
      { ...supabaseProfile }
    );
    expect(result.matches).toBe(false);
    expect(result.differences[0].field).toBe("positioning_statement (presence)");
  });

  it("compares the positioning value when both selected it", () => {
    const same = compareProfileRecords(
      "student1",
      { ...supabaseProfile, positioning_statement: "Building X" },
      { ...supabaseProfile, positioning_statement: "Building X" }
    );
    expect(same.matches).toBe(true);

    const differs = compareProfileRecords(
      "student1",
      { ...supabaseProfile, positioning_statement: "Building X" },
      { ...supabaseProfile, positioning_statement: null }
    );
    expect(differs.matches).toBe(false);
  });

  it("has no drift bucket to hide a difference in", () => {
    // Nothing on a profile is incremented by readers, so unlike a post there is
    // no legitimate reason for the two sides to disagree.
    const result = compareProfileRecords("student1", supabaseProfile, {
      ...supabaseProfile,
      full_name: "Someone Else",
    });
    expect(result.drift).toEqual([]);
    expect(result.matches).toBe(false);
  });

  it("shares the report format with the post comparison", () => {
    const report = formatParityReport([
      compareProfileRecords("student1", supabaseProfile, { ...supabaseProfile }),
      compareProfileRecords("student2", supabaseProfile, null),
    ]);
    expect(report).toContain("1/2 subjects match");
    expect(report).toContain("student2");
  });
});
