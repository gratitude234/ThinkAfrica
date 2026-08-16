import { describe, expect, it } from "vitest";
import {
  getCampusContributionNextAction,
  getCampusMetricState,
  normalizeCampusName,
  parseOptionalPercentage,
} from "./campus";

describe("campus cohort metrics", () => {
  it("never fabricates a threshold", () => {
    expect(getCampusMetricState({ rate: 42, target: null, eligibleCount: 20 })).toBe(
      "not_set"
    );
  });

  it("distinguishes data collection from target performance", () => {
    expect(getCampusMetricState({ rate: null, target: 30, eligibleCount: 0 })).toBe(
      "collecting"
    );
    expect(getCampusMetricState({ rate: 31, target: 30, eligibleCount: 10 })).toBe(
      "on_target"
    );
    expect(getCampusMetricState({ rate: 29, target: 30, eligibleCount: 10 })).toBe(
      "below_target"
    );
  });

  it("validates optional percentage targets", () => {
    expect(parseOptionalPercentage(42.126)).toBe(42.13);
    expect(parseOptionalPercentage(101)).toBeUndefined();
    expect(parseOptionalPercentage("")).toBeNull();
  });
});

describe("campus contribution loop", () => {
  it("moves a contributor from first publication to second publication to response", () => {
    expect(
      getCampusContributionNextAction({
        publishedCount: 0,
        responsesPublishedCount: 0,
        promptId: "prompt-1",
      })
    ).toMatchObject({
      key: "first_publication",
      href: "/create/post?prompt=prompt-1",
    });

    expect(
      getCampusContributionNextAction({
        publishedCount: 1,
        responsesPublishedCount: 0,
      }).key
    ).toBe("second_publication");

    expect(
      getCampusContributionNextAction({
        publishedCount: 2,
        responsesPublishedCount: 0,
      }).key
    ).toBe("first_response");
  });

  it("normalizes campus names without changing their spelling", () => {
    expect(normalizeCampusName("  University   of Lagos ")).toBe(
      "University of Lagos"
    );
  });
});
