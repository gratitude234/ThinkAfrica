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

describe("ProfileHeader stats bar", () => {
  it("labels the combined published-work count 'Published', not 'Publications' -- it includes short Posts, not just Article/Research", () => {
    render(
      <ProfileHeader
        profile={baseProfile()}
        isOwnProfile
        currentUserId="user-1"
        initialFollowing={false}
        isOpenToOpportunities={false}
        canContact={false}
        talentProfileId={null}
        writingSince="Jan 2026"
        stats={{
          postCount: 12,
          citableCount: 2,
          reviewedCount: 3,
          coAuthoredCount: 1,
          followerCount: 0,
          followingCount: 0,
          totalViews: 0,
          totalLikes: 0,
          debateContributionCount: 0,
          topicCount: 0,
          badgeCount: 0,
          points: 0,
        }}
      />
    );

    expect(screen.getByText("Published")).toBeInTheDocument();
    expect(screen.queryByText("Publications")).not.toBeInTheDocument();
  });
});
