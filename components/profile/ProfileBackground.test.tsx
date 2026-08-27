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

/**
 * The identity header carries the first three demonstrated topics, so this
 * section renders only what comes after them. Fixtures pad past that boundary,
 * and these three are never expected to appear in the rail.
 */
const HEADER_FILLER = [
  { key: "policy", label: "Policy", count: 9 },
  { key: "economics", label: "Economics", count: 8 },
  { key: "health", label: "Health", count: 7 },
];

const DEMONSTRATED = [
  ...HEADER_FILLER,
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

    expect(screen.getByText("More demonstrated topics")).toBeInTheDocument();
    expect(screen.getByText("Interested in")).toBeInTheDocument();
    // The word the old single list used. A tag appearing once is not a claim
    // of expertise, and Phase 1 does not make one.
    expect(screen.queryByText(/expertise/i)).not.toBeInTheDocument();
  });

  it("leaves the topics the header already printed out of the rail", () => {
    renderBackground();

    for (const topic of HEADER_FILLER) {
      expect(
        screen.queryByRole("link", { name: new RegExp(`^${topic.label}`) })
      ).not.toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /^Governance/ })).toBeInTheDocument();
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
    expect(screen.queryByText("More demonstrated topics")).not.toBeInTheDocument();
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

    const topics = screen.getByText("More demonstrated topics").parentElement;
    expect(within(topics as HTMLElement).getByText("3")).toBeInTheDocument();

    const interests = screen.getByText("Interested in").parentElement;
    expect(within(interests as HTMLElement).queryByText(/^\d+$/)).toBeNull();
  });
});

describe("demonstrated topic chip accessibility", () => {
  it("names the count in words instead of announcing a bare digit", () => {
    render(
      <ProfileBackground
        profile={profile}
        demonstratedTopics={[
          ...HEADER_FILLER,
          { key: "governance", label: "Governance", count: 4 },
        ]}
        interests={[]}
        isOwnProfile={false}
      />
    );

    // "Governance 4" could be a count, a rank or a year. The link says which.
    const link = screen.getByRole("link", {
      name: "Governance: 4 contributions in the Intellectual Record",
    });
    expect(link).toHaveAttribute("href", "/ada/record?topic=governance");
    expect(within(link).getByText("4")).toHaveAttribute("aria-hidden", "true");
  });

  it("uses the singular for one contribution", () => {
    render(
      <ProfileBackground
        profile={profile}
        demonstratedTopics={[
          ...HEADER_FILLER,
          { key: "law", label: "Law", count: 1 },
        ]}
        interests={[]}
        isOwnProfile={false}
      />
    );

    expect(
      screen.getByRole("link", {
        name: "Law: 1 contribution in the Intellectual Record",
      })
    ).toBeInTheDocument();
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
