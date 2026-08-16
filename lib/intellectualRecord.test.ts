import { describe, expect, it } from "vitest";
import {
  getContributionQualityLabels,
  getIntellectualRecordSummary,
} from "./intellectualRecord";

describe("Intellectual Record quality labels", () => {
  it("derives labels only from concrete contribution evidence", () => {
    expect(
      getContributionQualityLabels({
        referenceCount: 2,
        publishedVersionId: "version-1",
        citationId: "IND-2026-0042",
        coAuthorCount: 1,
      }).map((label) => label.key)
    ).toEqual(["source_backed", "reviewed", "citable", "coauthored"]);
  });

  it("does not manufacture a label when no evidence exists", () => {
    expect(getContributionQualityLabels({})).toEqual([]);
  });

  it("does not treat content type or popularity as review evidence", () => {
    expect(
      getContributionQualityLabels({
        referenceCount: 0,
        citationId: null,
        publishedVersionId: null,
      })
    ).toEqual([]);
  });
});

describe("Intellectual Record summary", () => {
  it("counts published work, linked responses, debates, and evidence separately", () => {
    expect(
      getIntellectualRecordSummary({
        posts: [
          { inResponseTo: "parent-1", referenceCount: 1 },
          { citationId: "IND-1", publishedVersionId: "version-1" },
          { isCoAuthor: true },
        ],
        debateContributionCount: 2,
      })
    ).toEqual({
      contributionCount: 5,
      publishedCount: 3,
      responseCount: 1,
      debateContributionCount: 2,
      sourceBackedCount: 1,
      reviewedCount: 1,
      citableCount: 1,
      coAuthoredCount: 1,
      qualityLabelledCount: 3,
    });
  });
});
