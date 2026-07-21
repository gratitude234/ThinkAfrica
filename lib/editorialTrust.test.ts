import { describe, expect, it } from "vitest";
import { getEditorialTrustSummary } from "./editorialTrust";

describe("getEditorialTrustSummary", () => {
  it("applies (shows the panel) for a policy brief even before any review has completed", () => {
    const summary = getEditorialTrustSummary({
      type: "policy_brief",
      status: "pending",
      citationId: null,
      publishedVersionId: null,
      reviews: [],
    });

    expect(summary.applies).toBe(true);
    expect(summary.currentStatusLabel).toBe("Submitted for review");
  });

  it("does not claim Reviewed for a policy brief that is still pending, evidence-based not name-based", () => {
    const summary = getEditorialTrustSummary({
      type: "policy_brief",
      status: "pending",
      citationId: null,
      publishedVersionId: null,
      reviews: [{ submitted_at: "2026-07-01T00:00:00.000Z" }],
    });

    expect(summary.publicSignals.map((signal) => signal.key)).not.toContain("reviewed");
  });

  it("claims Reviewed once the record has an accepted published version, regardless of type", () => {
    const summary = getEditorialTrustSummary({
      type: "policy_brief",
      status: "published",
      citationId: null,
      publishedVersionId: "11111111-1111-1111-1111-111111111111",
    });

    expect(summary.publicSignals.map((signal) => signal.key)).toContain("reviewed");
  });

  it("claims Reviewed once a citation_id exists", () => {
    const summary = getEditorialTrustSummary({
      type: "research",
      status: "published",
      citationId: "IND-2026-000123",
    });

    expect(summary.publicSignals.map((signal) => signal.key)).toContain("reviewed");
  });

  it("does not apply at all for a generic Article (no editorial workflow, no evidence)", () => {
    const summary = getEditorialTrustSummary({
      type: "essay",
      status: "published",
      citationId: null,
      publishedVersionId: null,
    });

    expect(summary.applies).toBe(false);
    expect(summary.currentStatusLabel).toBe("Community published");
  });
});
