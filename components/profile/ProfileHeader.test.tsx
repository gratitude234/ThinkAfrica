import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProfileHeader from "./ProfileHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/someone",
}));

function baseProfile(overrides: Partial<Parameters<typeof ProfileHeader>[0]["profile"]> = {}) {
  return {
    id: "user-1",
    username: "student1",
    full_name: "A Student",
    university: "University of Somewhere",
    field_of_study: "Economics",
    graduation_year: null,
    is_alumni: false,
    bio: null,
    avatar_url: null,
    cover_image_url: null,
    verified: false,
    verified_type: null,
    points: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderHeader(
  profileOverrides: Partial<Parameters<typeof ProfileHeader>[0]["profile"]> = {}
) {
  return render(
    <ProfileHeader
      profile={baseProfile(profileOverrides)}
      isOwnProfile
      currentUserId="user-1"
      initialFollowing={false}
      isOpenToOpportunities={false}
      canContact={false}
      talentProfileId={null}
      writingSince="Jan 2026"
    />
  );
}

describe("ProfileHeader", () => {
  it("presents identity: name, handle and affiliation", () => {
    renderHeader();

    expect(screen.getByText("A Student")).toBeInTheDocument();
    expect(screen.getByText("@student1")).toBeInTheDocument();
    expect(
      screen.getByText(/University of Somewhere/)
    ).toBeInTheDocument();
  });

  it("states the verified type in text rather than by icon alone", () => {
    renderHeader({ verified: true, verified_type: "student" });

    expect(screen.getByText("Verified Student")).toBeInTheDocument();
  });

  // Contribution counts belong to RecordPanel. Repeating them in the header
  // was how the same figure ended up stated four times on one page, which is
  // what made a small record look padded.
  it("does not restate contribution counts", () => {
    renderHeader();

    expect(screen.queryByText("Record")).not.toBeInTheDocument();
    expect(screen.queryByText("Source-backed")).not.toBeInTheDocument();
    expect(screen.queryByText("Citable")).not.toBeInTheDocument();
  });
});
