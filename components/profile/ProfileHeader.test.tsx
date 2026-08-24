import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getProfileIdentityLines } from "@/lib/profileIdentity";
import ProfileHeader from "./ProfileHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/student1",
  useSearchParams: () => new URLSearchParams(),
}));

function baseProfile(
  overrides: Partial<Parameters<typeof ProfileHeader>[0]["profile"]> = {}
) {
  return {
    id: "user-1",
    username: "student1",
    full_name: "A Student",
    country: "Nigeria",
    university: "University of Lagos",
    field_of_study: "Political Science",
    graduation_year: 2028,
    is_alumni: false,
    bio: "Writes about governance and institutions.",
    avatar_url: null,
    cover_image_url: null,
    verified: false,
    verified_type: null,
    profile_type: "student",
    professional_title: null,
    organization_name: null,
    organization_website: null,
    ...overrides,
  };
}

function renderHeader(
  profileOverrides: Partial<Parameters<typeof ProfileHeader>[0]["profile"]> = {}
) {
  return render(
    <ProfileHeader
      profile={baseProfile(profileOverrides)}
      topics={["Governance", "History", "Policy", "Economics"]}
      recordSummary={{
        publicationCount: 5,
        sourceBackedCount: 3,
        citableCount: 1,
        responseCount: 4,
        debateCount: 2,
        researchCount: 0,
      }}
      followerCount={12}
      isOwnProfile
      currentUserId="user-1"
      initialFollowing={false}
      isOpenToOpportunities={false}
      canContact={false}
      talentProfileId={null}
    />
  );
}

describe("ProfileHeader", () => {
  it("derives a student identity without showing a persona label", () => {
    renderHeader();

    expect(screen.getByText("Political Science student")).toBeInTheDocument();
    expect(screen.getByText("University of Lagos · Nigeria")).toBeInTheDocument();
    expect(screen.queryByText("Student", { exact: true })).not.toBeInTheDocument();
  });

  it("uses professional identity fields for non-students", () => {
    expect(
      getProfileIdentityLines(
        baseProfile({
          profile_type: "professional",
          university: null,
          field_of_study: null,
          professional_title: "Climate policy researcher",
          organization_name: "Civic Lab",
        })
      )
    ).toEqual({
      headline: "Climate policy researcher",
      affiliation: "Civic Lab · Nigeria",
    });
  });

  it("falls back to affiliation and Writer on Indegenius for incomplete legacy profiles", () => {
    expect(
      getProfileIdentityLines(
        baseProfile({
          profile_type: null,
          professional_title: null,
          field_of_study: "Economics",
        })
      )
    ).toEqual({
      headline: "Writer on Indegenius",
      affiliation: "University of Lagos · Nigeria",
    });
  });

  it("exposes verification and the compact record accessibly", () => {
    renderHeader({ verified: true, verified_type: "student" });

    expect(screen.getByLabelText("Verified student")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /5 Publications\. Original published work/i,
      })
    ).toHaveAttribute("href", "/student1/record?type=publications");
    expect(screen.getByText("Source-backed")).toBeInTheDocument();
    expect(screen.getByText("Citable")).toBeInTheDocument();
    expect(screen.queryByText(/point/i)).not.toBeInTheDocument();
  });

  it("limits the visible topic chips to three", () => {
    renderHeader();

    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Policy")).toBeInTheDocument();
    expect(screen.queryByText("Economics")).not.toBeInTheDocument();
  });
});
