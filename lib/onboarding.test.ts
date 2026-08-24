import { describe, expect, it } from "vitest";
import {
  deriveLegacyOnboardingPreference,
  normalizeOnboardingPreference,
  parseOnboardingStep,
} from "@/lib/onboarding";

describe("identity-first onboarding compatibility", () => {
  it("maps legacy onboarding links onto the four new steps", () => {
    expect(parseOnboardingStep("persona")).toBe("path");
    expect(parseOnboardingStep("interests")).toBe("topics");
    expect(parseOnboardingStep("follow")).toBe("record");
    expect(parseOnboardingStep("identity")).toBe("identity");
  });

  it("derives a private starting category for incomplete legacy profiles", () => {
    expect(deriveLegacyOnboardingPreference("student")).toEqual({
      currentPath: "student",
      workCategory: null,
    });
    expect(deriveLegacyOnboardingPreference("educator")).toEqual({
      currentPath: "non_student",
      workCategory: "research_education",
    });
    expect(deriveLegacyOnboardingPreference("ngo_nonprofit")).toEqual({
      currentPath: "non_student",
      workCategory: "policy_community",
    });
  });

  it("fails closed when an RPC returns an unknown path or category", () => {
    expect(
      normalizeOnboardingPreference({
        current_path: "creator",
        work_category: "celebrity",
      })
    ).toEqual({ currentPath: null, workCategory: null });
  });
});
