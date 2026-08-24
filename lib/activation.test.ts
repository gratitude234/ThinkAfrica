import { describe, expect, it } from "vitest";
import { isProfileComplete } from "@/lib/activation";

const sharedProfile = {
  full_name: "Amara Diallo",
  username: "amara",
  country: "Senegal",
  interests: ["Public Policy"],
};

describe("isProfileComplete", () => {
  it("requires academic context for an academic persona", () => {
    expect(
      isProfileComplete({
        ...sharedProfile,
        profile_type: "student",
        university: "Université Cheikh Anta Diop",
        field_of_study: "Public Policy",
      })
    ).toBe(true);

    expect(
      isProfileComplete({
        ...sharedProfile,
        profile_type: "student",
        university: null,
        field_of_study: null,
      })
    ).toBe(false);
  });

  it("does not require university fields for a non-academic persona", () => {
    expect(
      isProfileComplete({
        ...sharedProfile,
        profile_type: "founder",
        university: null,
        field_of_study: null,
      })
    ).toBe(true);
  });

  it("uses the private onboarding path for the new identity rules", () => {
    expect(
      isProfileComplete(
        {
          ...sharedProfile,
          interests: ["Governance & Policy", "Education", "Public Health"],
          profile_type: "professional",
          professional_title: "Policy researcher",
        },
        {
          currentPath: "non_student",
          workCategory: "policy_community",
        }
      )
    ).toBe(true);

    expect(
      isProfileComplete(
        {
          ...sharedProfile,
          interests: ["Governance & Policy", "Education", "Public Health"],
          profile_type: "professional",
          professional_title: null,
        },
        {
          currentPath: "non_student",
          workCategory: "policy_community",
        }
      )
    ).toBe(false);
  });
});
