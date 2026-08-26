import { describe, expect, it } from "vitest";
import {
  buildProfileRecordHref,
  normalizeProfileRecordSummary,
  parseProfileRecordQuery,
} from "./profileRecord";

describe("profile record query contract", () => {
  it("normalizes invalid filters and pages", () => {
    expect(
      parseProfileRecordQuery(
        { type: "unknown", quality: "unknown", page: "-3" },
        true
      )
    ).toEqual({ filter: "all", quality: "all", topic: null, page: 1 });
    expect(parseProfileRecordQuery({ page: "2.5" }, true).page).toBe(1);
    expect(parseProfileRecordQuery({ page: "2later" }, true).page).toBe(1);
  });

  it("moves evidence filters to publications when combined with responses", () => {
    expect(
      parseProfileRecordQuery(
        { type: "responses", quality: "source_backed", page: "2" },
        true
      )
    ).toEqual({
      filter: "publications",
      quality: "source_backed",
      topic: null,
      page: 2,
    });
  });

  it("normalizes Research away when the feature is disabled", () => {
    expect(
      parseProfileRecordQuery({ type: "research", quality: "citable" }, false)
    ).toEqual({ filter: "publications", quality: "citable", topic: null, page: 1 });
  });

  it("preserves active filters in pagination links", () => {
    expect(
      buildProfileRecordHref({
        username: "ada",
        filter: "publications",
        quality: "citable",
        page: 3,
      })
    ).toBe("/ada/record?type=publications&quality=citable&page=3");
  });

  it("lowercases topics and drops empty or oversized ones", () => {
    expect(parseProfileRecordQuery({ topic: "  Poetry " }, true).topic).toBe("poetry");
    expect(parseProfileRecordQuery({ topic: "   " }, true).topic).toBeNull();
    expect(parseProfileRecordQuery({ topic: "x".repeat(61) }, true).topic).toBeNull();
  });

  it("keeps the active topic in filter and pagination links", () => {
    expect(
      buildProfileRecordHref({
        username: "ada",
        filter: "publications",
        topic: "Poetry",
        page: 2,
      })
    ).toBe("/ada/record?type=publications&topic=poetry&page=2");
  });

  it("builds hrefs whose key order survives the canonical-URL check", () => {
    // The record page rebuilds the incoming URL in the order type, quality,
    // topic, page and redirects when it differs. A reordering here would be a
    // redirect loop rather than a cosmetic change.
    expect(
      buildProfileRecordHref({
        username: "ada",
        filter: "publications",
        quality: "citable",
        topic: "africa",
        page: 3,
      })
    ).toBe("/ada/record?type=publications&quality=citable&topic=africa&page=3");
  });

  it("normalizes Supabase bigint strings", () => {
    expect(
      normalizeProfileRecordSummary([
        {
          publication_count: "4",
          source_backed_count: "2",
          citable_count: "1",
          response_count: "3",
          debate_count: "2",
          research_count: "1",
        },
      ])
    ).toEqual({
      publicationCount: 4,
      sourceBackedCount: 2,
      citableCount: 1,
      responseCount: 3,
      debateCount: 2,
      researchCount: 1,
    });
  });
});
