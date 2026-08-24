import { describe, expect, it } from "vitest";
import {
  deriveLegacyOnboardingPreference,
  getCategoryPrimaryProfileType,
  getCategoryProfileTypes,
  normalizeOnboardingPreference,
  parseOnboardingStep,
  WORK_CATEGORY_OPTIONS,
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

describe("work category profile types", () => {
  it("round-trips every category through the public profile type", () => {
    for (const option of WORK_CATEGORY_OPTIONS) {
      const profileType = getCategoryPrimaryProfileType(option.value);
      expect(profileType).not.toBeNull();
      // A settings save re-derives the private category from profile_type, so a
      // category that does not survive the round trip gets silently rewritten.
      expect(deriveLegacyOnboardingPreference(profileType)).toEqual({
        currentPath: "non_student",
        workCategory: option.value,
      });
    }
  });

  it("keeps each primary type inside its own suggestion match list", () => {
    for (const option of WORK_CATEGORY_OPTIONS) {
      expect(getCategoryProfileTypes(option.value)).toContain(
        getCategoryPrimaryProfileType(option.value)
      );
    }
  });
});
