import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileBackground from "./ProfileBackground";

const profile = {
  id: "profile-1",
  username: "ada",
  full_name: "Ada",
  country: "Nigeria",
  university: null,
  field_of_study: null,
  graduation_year: null,
  is_alumni: false,
  bio: null,
  avatar_url: null,
  verified: false,
  verified_type: null,
  profile_type: "professional",
  professional_title: "Policy researcher",
  organization_name: "Civic Lab",
  organization_website: "https://civic.example/about",
};

describe("ProfileBackground", () => {
  it("renders professional context and declared topics without gamified metrics", () => {
    render(
      <ProfileBackground
        profile={profile}
        topics={["Governance", "Climate"]}
        isOwnProfile={false}
      />
    );

    expect(screen.getByText("Policy researcher")).toBeInTheDocument();
    expect(screen.getByText("Civic Lab")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Organisation website/ })).toHaveAttribute(
      "href",
      "https://civic.example/about"
    );
    expect(screen.queryByText(/points?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/readiness/i)).not.toBeInTheDocument();
  });

  it("does not render unsafe external links", () => {
    render(
      <ProfileBackground
        profile={{ ...profile, organization_website: "javascript:alert(1)" }}
        topics={[]}
        isOwnProfile={false}
      />
    );

    expect(screen.queryByRole("link", { name: /Organisation website/ })).not.toBeInTheDocument();
  });
});
