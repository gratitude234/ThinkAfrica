import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProfileBackground, { hasBackgroundContent } from "./ProfileBackground";

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
  positioning_statement: null,
};

const DEMONSTRATED = [
  { key: "governance", label: "Governance", count: 3 },
  { key: "climate", label: "Climate", count: 1 },
];

function renderBackground(
  overrides: Partial<Parameters<typeof ProfileBackground>[0]> = {}
) {
  return render(
    <ProfileBackground
      profile={profile}
      demonstratedTopics={DEMONSTRATED}
      interests={[]}
      isOwnProfile={false}
      {...overrides}
    />
  );
}

describe("ProfileBackground", () => {
  it("renders professional context without gamified metrics", () => {
    renderBackground();

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
    renderBackground({
      profile: { ...profile, organization_website: "javascript:alert(1)" },
      demonstratedTopics: [],
    });

    expect(screen.queryByRole("link", { name: /Organisation website/ })).not.toBeInTheDocument();
  });
});

describe("ProfileBackground topics and interests", () => {
  it("keeps demonstrated topics and declared interests in separate fields", () => {
    renderBackground({ interests: ["Youth", "Diaspora"] });

    expect(screen.getByText("Demonstrated topics")).toBeInTheDocument();
    expect(screen.getByText("Interested in")).toBeInTheDocument();
    // The word the old single list used. A tag appearing once is not a claim
    // of expertise, and Phase 1 does not make one.
    expect(screen.queryByText(/expertise/i)).not.toBeInTheDocument();
  });

  it("links every demonstrated topic to the record filter that holds its work", () => {
    renderBackground();

    expect(screen.getByRole("link", { name: /^Governance/ })).toHaveAttribute(
      "href",
      "/ada/record?topic=governance"
    );
    expect(screen.getByRole("link", { name: /^Climate/ })).toHaveAttribute(
      "href",
      "/ada/record?topic=climate"
    );
  });

  it("never turns a declared interest into a record filter", () => {
    renderBackground({ demonstratedTopics: [], interests: ["Youth"] });

    expect(
      screen.queryByRole("link", { name: /Youth/ })
    ).not.toHaveAttribute("href", "/ada/record?topic=youth");
    expect(screen.queryByText("Demonstrated topics")).not.toBeInTheDocument();
  });

  it("links an interest only when it names a real platform topic", () => {
    renderBackground({
      demonstratedTopics: [],
      // "Economics" is a canonical platform tag with a topic page behind it.
      // "Some private curiosity" is not, so linking it would promise a page
      // with nothing on it.
      interests: ["Economics", "Some private curiosity"],
    });

    expect(screen.getByRole("link", { name: "Economics" })).toHaveAttribute(
      "href",
      "/topics/economics"
    );
    expect(
      screen.queryByRole("link", { name: "Some private curiosity" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Some private curiosity")).toBeInTheDocument();
  });

  it("shows contribution counts beside demonstrated topics only", () => {
    renderBackground({ interests: ["Youth"] });

    const topics = screen.getByText("Demonstrated topics").parentElement;
    expect(within(topics as HTMLElement).getByText("3")).toBeInTheDocument();

    const interests = screen.getByText("Interested in").parentElement;
    expect(within(interests as HTMLElement).queryByText(/^\d+$/)).toBeNull();
  });
});

describe("hasBackgroundContent", () => {
  const bare = {
    ...profile,
    professional_title: null,
    organization_name: null,
    organization_website: null,
  };

  it("counts declared interests as content worth a section", () => {
    expect(
      hasBackgroundContent({
        profile: bare,
        demonstratedTopics: [],
        interests: ["Youth"],
      })
    ).toBe(true);
  });

  it("stays empty for a profile with neither topics nor interests", () => {
    expect(
      hasBackgroundContent({ profile: bare, demonstratedTopics: [], interests: [] })
    ).toBe(false);
  });
});
