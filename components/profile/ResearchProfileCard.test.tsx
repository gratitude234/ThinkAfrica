import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResearchProfileCard, {
  type PublicResearchProfile,
  type PublicResearchProject,
} from "./ResearchProfileCard";

const profile: PublicResearchProfile = {
  headline: "Public-health systems researcher",
  overview: "Studies how primary-care systems distribute access.",
  research_interests: ["Health systems"],
  methods: ["Interviews"],
  collaboration_status: "open",
  preferred_roles: ["researcher", "writer"],
  orcid_url: "https://orcid.org/0000-0001-2345-678X",
  website_url: null,
};

const projects: PublicResearchProject[] = [
  {
    id: "project-1",
    slug: "primary-care-access",
    title: "Primary-care access",
    summary: "A comparative study of access to primary care.",
    status: "active",
    disciplines: ["Public health"],
    role: "lead",
    updated_at: "2026-08-16T12:00:00.000Z",
  },
  {
    id: "project-2",
    slug: "community-health-workers",
    title: "Community health workers",
    summary: "Documenting the evidence behind community health programmes.",
    status: "completed",
    disciplines: ["Health policy"],
    role: "writer",
    updated_at: "2026-08-15T12:00:00.000Z",
  },
];

describe("ResearchProfileCard", () => {
  it("keeps an empty visitor profile out of the public record", () => {
    const { container } = render(
      <ResearchProfileCard
        displayName="Ada"
        profile={null}
        projects={[]}
        isOwnProfile={false}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows evidence-backed project counts and destinations", () => {
    render(
      <ResearchProfileCard
        displayName="Ada"
        profile={profile}
        projects={projects}
        isOwnProfile={false}
      />
    );

    expect(screen.getByRole("heading", { name: profile.headline! })).toBeInTheDocument();
    expect(screen.getByText("Open to collaboration requests")).toBeInTheDocument();
    expect(screen.getAllByRole("definition").map((item) => item.textContent)).toEqual([
      "2",
      "1",
      "1",
    ]);
    expect(screen.getByRole("link", { name: /Primary-care access/i })).toHaveAttribute(
      "href",
      "/research/projects/primary-care-access"
    );
  });

  it("gives an owner a path to start their research record", () => {
    render(
      <ResearchProfileCard
        displayName="Ada"
        profile={null}
        projects={[]}
        isOwnProfile
      />
    );

    expect(screen.getByRole("link", { name: "Add research profile" })).toHaveAttribute(
      "href",
      "/research/profile"
    );
    expect(
      screen.getByRole("link", { name: "Create your first research proposal" })
    ).toHaveAttribute("href", "/research/proposals/new");
  });
});
