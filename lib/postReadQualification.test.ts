import { describe, expect, it } from "vitest";
import { isQualifiedPublicationRead, qualifiedReadThresholds } from "./postReadQualification";

describe("qualified reads", () => {
  it("asks less of a short publication than of a long one", () => {
    expect(qualifiedReadThresholds(600)).toEqual({ activeSeconds: 15, scrollDepth: 50 });
    expect(qualifiedReadThresholds(601)).toEqual({ activeSeconds: 30, scrollDepth: 60 });
  });

  it("applies the short and long thresholds at their boundaries", () => {
    expect(
      isQualifiedPublicationRead({ wordCount: 600, activeSeconds: 15, scrollDepth: 50 })
    ).toBe(true);
    expect(
      isQualifiedPublicationRead({ wordCount: 601, activeSeconds: 29, scrollDepth: 60 })
    ).toBe(false);
    expect(
      isQualifiedPublicationRead({ wordCount: 601, activeSeconds: 30, scrollDepth: 60 })
    ).toBe(true);
  });

  it("never qualifies a read with missing metrics", () => {
    expect(
      isQualifiedPublicationRead({ wordCount: 10, activeSeconds: null, scrollDepth: 100 })
    ).toBe(false);
    expect(
      isQualifiedPublicationRead({ wordCount: 10, activeSeconds: 60, scrollDepth: null })
    ).toBe(false);
  });
});
