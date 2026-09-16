import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  escapeLikeFragment,
  normalizeSearchQuery,
  orIlikeFilter,
  MAX_SEARCH_QUERY_LENGTH,
  topicKeysFromCounts,
} = await import("@/lib/searchData");

/**
 * The filter builders, which is where the bug was.
 *
 * The old code interpolated the user's text into a PostgREST or= filter, so a
 * search containing a comma or a bracket sent a malformed filter and returned
 * nothing at all. A search that quietly finds nothing looks like a search that
 * found nothing, which is why it survived so long.
 */

describe("escapeLikeFragment", () => {
  it("leaves ordinary text alone", () => {
    expect(escapeLikeFragment("african policy")).toBe("african policy");
  });

  it("escapes the LIKE wildcards", () => {
    // Unescaped, a search for "100%" matches every row and "a_b" matches "axb".
    expect(escapeLikeFragment("100%")).toBe("100\\%");
    expect(escapeLikeFragment("a_b")).toBe("a\\_b");
  });

  it("escapes the escape character first", () => {
    // Escaping the backslash after the wildcards would escape the escapes.
    expect(escapeLikeFragment("a\\b")).toBe("a\\\\b");
    expect(escapeLikeFragment("\\%")).toBe("\\\\\\%");
  });
});

describe("orIlikeFilter", () => {
  it("builds one clause per column", () => {
    expect(orIlikeFilter(["title", "excerpt"], "africa")).toBe(
      'title.ilike."%africa%",excerpt.ilike."%africa%"'
    );
  });

  it("quotes the value so a comma cannot end the clause", () => {
    // This is the bug. or= is a comma-separated list of filters, so `a,b`
    // used to send a third filter, `b%`, and PostgREST rejected the request.
    const filter = orIlikeFilter(["title"], "a,b");
    expect(filter).toBe('title.ilike."%a,b%"');
    expect(filter.split('"')[1]).toBe("%a,b%");
  });

  it("survives the other characters PostgREST reads as grammar", () => {
    for (const query of ["a.b", "a(b)", "a:b", "not(a)", "a)b,c("]) {
      const filter = orIlikeFilter(["title"], query);
      // Everything between the quotes is the value, whatever it contains.
      expect(filter.startsWith('title.ilike."%')).toBe(true);
      expect(filter.endsWith('%"')).toBe(true);
    }
  });

  it("escapes a double quote rather than closing the value with it", () => {
    expect(orIlikeFilter(["title"], 'say "yes"')).toBe(
      'title.ilike."%say \\"yes\\"%"'
    );
  });

  it("double-escapes a backslash so both layers unwrap correctly", () => {
    // PostgREST removes one layer; Postgres receives the one meant for it.
    expect(orIlikeFilter(["title"], "a\\b")).toBe(
      'title.ilike."%a\\\\\\\\b%"'
    );
  });

  it("keeps a LIKE wildcard literal through both layers", () => {
    // "100%" must search for "100%", not for everything.
    expect(orIlikeFilter(["title"], "100%")).toBe('title.ilike."%100\\\\%%"');
  });
});

describe("normalizeSearchQuery", () => {
  it("treats blank input as no search rather than as a search for nothing", () => {
    expect(normalizeSearchQuery(null)).toBeNull();
    expect(normalizeSearchQuery("")).toBeNull();
    expect(normalizeSearchQuery("   ")).toBeNull();
  });

  it("trims", () => {
    expect(normalizeSearchQuery("  africa  ")).toBe("africa");
  });

  it("caps a paste rather than rejecting it", () => {
    const long = "a".repeat(MAX_SEARCH_QUERY_LENGTH + 50);
    expect(normalizeSearchQuery(long)).toHaveLength(MAX_SEARCH_QUERY_LENGTH);
  });
});

describe("topicKeysFromCounts", () => {
  it("normalises the labels into the keys a tag field inserts", () => {
    expect(
      topicKeysFromCounts([
        { tag: "Africa", count: 3 },
        { tag: "Policy", count: 1 },
      ])
    ).toEqual(["africa", "policy"]);
  });

  it("collapses spellings that normalise to the same key", () => {
    // The reason both surfaces read one query: they used to key on different
    // things, so "#africa" and "africa" counted as two topics.
    expect(
      topicKeysFromCounts([
        { tag: "africa", count: 3 },
        { tag: "Africa", count: 1 },
      ])
    ).toEqual(["africa"]);
  });

  it("sorts alphabetically, because a suggestion list is scanned not ranked", () => {
    expect(
      topicKeysFromCounts([
        { tag: "zambia", count: 9 },
        { tag: "angola", count: 1 },
      ])
    ).toEqual(["angola", "zambia"]);
  });
});
