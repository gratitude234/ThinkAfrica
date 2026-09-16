import { describe, expect, it } from "vitest";
import {
  getOnboardingProfileError,
  LEGACY_ONBOARDING_STEPS,
  ONBOARDING_STEPS,
  parseOnboardingStep,
  resolveOnboardingStep,
} from "@/lib/onboarding";

/**
 * The onboarding step-set contract. Onboarding is a profile, then topics. A
 * member who stopped on a step the publishing reset removed resumes on the
 * step that now holds its purpose, and nothing ever asks what someone is.
 */
describe("the onboarding step set", () => {
  it("is a profile and topics, in that order, and nothing else", () => {
    expect([...ONBOARDING_STEPS]).toEqual(["profile", "topics"]);
  });

  it("maps every retired step onto a step that exists", () => {
    expect(parseOnboardingStep("path")).toBe("profile");
    expect(parseOnboardingStep("identity")).toBe("profile");
    expect(parseOnboardingStep("persona")).toBe("profile");
    expect(parseOnboardingStep("interests")).toBe("topics");
    expect(parseOnboardingStep("record")).toBe("topics");
    expect(parseOnboardingStep("follow")).toBe("topics");
    for (const step of Object.values(LEGACY_ONBOARDING_STEPS)) {
      expect(ONBOARDING_STEPS).toContain(step);
    }
  });

  it("recognises the current steps and nothing invented", () => {
    expect(parseOnboardingStep("profile")).toBe("profile");
    expect(parseOnboardingStep("topics")).toBe("topics");
    expect(parseOnboardingStep("welcome")).toBeNull();
    expect(parseOnboardingStep("")).toBeNull();
    expect(parseOnboardingStep(null)).toBeNull();
  });
});

describe("resuming", () => {
  const ready = { fullName: "Ada Obi", username: "ada" };

  it("opens the profile step on a first visit", () => {
    expect(resolveOnboardingStep(null, ready)).toBe("profile");
  });

  it("resumes a member stopped on a retired identity step at the profile step", () => {
    expect(resolveOnboardingStep("path", ready)).toBe("profile");
    expect(resolveOnboardingStep("identity", ready)).toBe("profile");
  });

  it("resumes a member stopped on topics or the record preview at topics", () => {
    expect(resolveOnboardingStep("topics", ready)).toBe("topics");
    expect(resolveOnboardingStep("interests", ready)).toBe("topics");
    expect(resolveOnboardingStep("record", ready)).toBe("topics");
  });

  it("never opens topics before a name and a usable username stand", () => {
    expect(resolveOnboardingStep("topics", { fullName: "", username: "ada" })).toBe("profile");
    expect(resolveOnboardingStep("topics", { fullName: "Ada", username: "" })).toBe("profile");
    expect(resolveOnboardingStep("topics", { fullName: "Ada", username: "settings" })).toBe("profile");
  });
});

describe("the profile step's rule", () => {
  it("needs a name and a usable username, and nothing else", () => {
    expect(getOnboardingProfileError({ fullName: "Ada", username: "ada", bio: "" })).toBeNull();
    expect(getOnboardingProfileError({ fullName: " ", username: "ada", bio: "" })).toBe("Add your name.");
    expect(getOnboardingProfileError({ fullName: "Ada", username: "", bio: "" })).toBe("Choose a username.");
    expect(getOnboardingProfileError({ fullName: "Ada", username: "admin", bio: "" })).toMatch(/reserved/);
    expect(getOnboardingProfileError({ fullName: "Ada", username: "Ada Obi", bio: "" })).toBeNull();
  });

  it("keeps the bio optional and bounded", () => {
    expect(getOnboardingProfileError({ fullName: "Ada", username: "ada", bio: "x".repeat(300) })).toBeNull();
    expect(getOnboardingProfileError({ fullName: "Ada", username: "ada", bio: "x".repeat(301) })).toMatch(/300/);
  });
});
