import { describe, expect, it } from "vitest";
import {
  resolveLandingFilter,
  type DebateLandingFilter,
} from "./landingFilter";

function counts(
  overrides: Partial<Record<DebateLandingFilter, number>> = {}
): Record<DebateLandingFilter, number> {
  return {
    active: 0,
    recruiting: 0,
    completed: 0,
    cancelled: 0,
    recaps: 0,
    ...overrides,
  };
}

describe("resolveLandingFilter — visitor picked a tab", () => {
  it("honours an explicitly chosen tab even when it is empty", () => {
    // Clicking "Active" and being silently shown Completed would be worse
    // than an honest empty state.
    expect(
      resolveLandingFilter("active", counts({ completed: 3 }), true)
    ).toBe("active");
  });

  it("honours an explicitly chosen empty tab that has content elsewhere", () => {
    expect(
      resolveLandingFilter("cancelled", counts({ active: 2 }), true)
    ).toBe("cancelled");
  });
});

describe("resolveLandingFilter — visitor just opened /debates", () => {
  it("stays on active when something is actually live", () => {
    expect(
      resolveLandingFilter("active", counts({ active: 1, completed: 5 }), false)
    ).toBe("active");
  });

  it("falls back to completed when nothing is live", () => {
    expect(
      resolveLandingFilter("active", counts({ completed: 1 }), false)
    ).toBe("completed");
  });

  it("prefers recruiting over completed, since it is the more current thing", () => {
    expect(
      resolveLandingFilter(
        "active",
        counts({ recruiting: 1, completed: 4 }),
        false
      )
    ).toBe("recruiting");
  });

  it("never leads with cancelled debates", () => {
    expect(
      resolveLandingFilter("active", counts({ cancelled: 6 }), false)
    ).toBe("active");
  });

  it("does not divert to recaps, whose debates already appear under completed", () => {
    expect(
      resolveLandingFilter(
        "active",
        counts({ completed: 2, recaps: 2 }),
        false
      )
    ).toBe("completed");
  });

  it("stays put when the whole room is empty", () => {
    expect(resolveLandingFilter("active", counts(), false)).toBe("active");
  });
});
