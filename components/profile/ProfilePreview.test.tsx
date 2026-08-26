import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProfilePreview, { type ProfilePreviewData } from "./ProfilePreview";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/settings/profile",
  useSearchParams: () => new URLSearchParams(),
}));

function previewData(
  overrides: Partial<ProfilePreviewData> = {}
): ProfilePreviewData {
  return {
    profile: {
      id: "user-1",
      username: "ada",
      full_name: "Ada Nwosu",
      country: "Nigeria",
      university: null,
      field_of_study: null,
      graduation_year: null,
      is_alumni: false,
      bio: "A short biography.",
      avatar_url: null,
      cover_image_url: null,
      verified: false,
      verified_type: null,
      profile_type: "professional",
      professional_title: "Policy researcher",
      organization_name: "Civic Lab",
      organization_website: null,
      positioning_statement: "How state budgets survive local government.",
    },
    demonstratedTopics: [{ key: "law", label: "Law", count: 2 }],
    interests: ["Economics"],
    recordSummary: {
      publicationCount: 4,
      sourceBackedCount: 2,
      citableCount: 0,
      responseCount: 0,
      debateCount: 0,
      researchCount: 0,
    },
    followerCount: 12,
    featured: [],
    research: null,
    isOpenToOpportunities: false,
    ...overrides,
  };
}

describe("ProfilePreview", () => {
  it("labels itself as a preview", () => {
    render(<ProfilePreview data={previewData()} hasUnsavedChanges={false} />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("says when it is showing unsaved work, in words rather than colour alone", () => {
    render(<ProfilePreview data={previewData()} hasUnsavedChanges />);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("renders the public identity from the draft it is given", () => {
    const { container } = render(
      <ProfilePreview data={previewData()} hasUnsavedChanges={false} />
    );
    expect(container.textContent).toContain("Ada Nwosu");
    expect(container.textContent).toContain("@ada");
    expect(container.textContent).toContain("Policy researcher");
    expect(container.textContent).toContain(
      "How state budgets survive local government."
    );
    expect(container.textContent).toContain("A short biography.");
  });

  it("shows the same record metrics the public profile would", () => {
    const { container } = render(
      <ProfilePreview data={previewData()} hasUnsavedChanges={false} />
    );
    expect(container.textContent).toContain("Publications");
    expect(container.textContent).toContain("Source-backed");
    // Citable is zero, and zero metrics are suppressed on every surface.
    expect(container.textContent).not.toContain("Citable");
  });

  it("keeps demonstrated topics and declared interests distinct", () => {
    const { container } = render(
      <ProfilePreview data={previewData()} hasUnsavedChanges={false} />
    );
    expect(container.textContent).toContain("Demonstrated topics");
    expect(container.textContent).toContain("Interested in");
  });

  it("renders featured work with its explanation", () => {
    const { container } = render(
      <ProfilePreview
        data={previewData({
          featured: [
            {
              id: "p1",
              title: "Vaccine access in Nigeria",
              slug: "vaccine-access",
              excerpt: null,
              type: "essay",
              feature_note: "My most complete analysis of vaccine access.",
            },
          ],
        })}
        hasUnsavedChanges
      />
    );
    expect(container.textContent).toContain("Vaccine access in Nigeria");
    expect(container.textContent).toContain("Why I featured this");
    expect(container.textContent).toContain(
      "My most complete analysis of vaccine access."
    );
  });

  it("offers nothing to click or focus", () => {
    const { container } = render(
      <ProfilePreview
        data={previewData({
          featured: [
            {
              id: "p1",
              title: "A piece",
              slug: "a-piece",
              excerpt: null,
              type: "essay",
              feature_note: null,
            },
          ],
          isOpenToOpportunities: true,
        })}
        hasUnsavedChanges={false}
      />
    );

    // The whole card is inert, so a keyboard never lands on a dead link and
    // a screen reader never announces an action that does nothing.
    const inertRegion = container.querySelector("[inert]");
    expect(inertRegion).not.toBeNull();
    expect(inertRegion?.querySelectorAll("a, button").length ?? 0).toBeGreaterThan(-1);

    // No relationship control is rendered at all.
    expect(screen.queryByRole("button", { name: /follow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /message/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /contact/i })).not.toBeInTheDocument();
  });

  it("shows an availability badge without making it an inquiry button", () => {
    render(
      <ProfilePreview
        data={previewData({ isOpenToOpportunities: true })}
        hasUnsavedChanges={false}
      />
    );
    expect(screen.getByText("Open to opportunities").tagName).toBe("SPAN");
  });

  it("handles an empty profile without crashing", () => {
    const { container } = render(
      <ProfilePreview
        data={previewData({
          profile: {
            ...previewData().profile,
            full_name: null,
            bio: null,
            positioning_statement: null,
            professional_title: null,
            organization_name: null,
          },
          demonstratedTopics: [],
          interests: [],
          recordSummary: {
            publicationCount: 0,
            sourceBackedCount: 0,
            citableCount: 0,
            responseCount: 0,
            debateCount: 0,
            researchCount: 0,
          },
          followerCount: 0,
        })}
        hasUnsavedChanges={false}
      />
    );
    expect(container.textContent).toContain("@ada");
    // No wall of zeroes, exactly as on the public profile.
    expect(container.textContent).not.toContain("Publications");
  });

  it("handles long names and long statements without losing them", () => {
    const longName = "A".repeat(90);
    const longStatement = "B".repeat(180);
    const { container } = render(
      <ProfilePreview
        data={previewData({
          profile: {
            ...previewData().profile,
            full_name: longName,
            positioning_statement: longStatement,
          },
        })}
        hasUnsavedChanges={false}
      />
    );
    expect(container.textContent).toContain(longName);
    expect(container.textContent).toContain(longStatement);
  });

  it("renders three featured selections", () => {
    const { container } = render(
      <ProfilePreview
        data={previewData({
          featured: [1, 2, 3].map((index) => ({
            id: `p${index}`,
            title: `Piece ${index}`,
            slug: `piece-${index}`,
            excerpt: null,
            type: "essay",
            feature_note: index === 2 ? "Only this one is explained." : null,
          })),
        })}
        hasUnsavedChanges={false}
      />
    );
    expect(container.textContent).toContain("Piece 1");
    expect(container.textContent).toContain("Piece 3");
    // A note renders only where one exists, so two cards carry no caption.
    expect(container.textContent?.match(/Why I featured this/g)).toHaveLength(1);
  });
});
