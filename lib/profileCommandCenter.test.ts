import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getVisibleProfileSections,
  isProfileSectionKey,
  PROFILE_SECTIONS,
  PROFILE_SECTION_DEFINITIONS,
  toNextActionState,
  withNextAction,
  type ProfileCommandCenterModel,
} from "./profileCommandCenter";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const loader = read("lib/profileCommandCenterData.ts");
const actions = read("app/(main)/settings/profile/actions.ts");
const commandCenter = read("app/(main)/settings/profile/ProfileCommandCenter.tsx");
const settingsPage = read("app/(main)/settings/page.tsx");
const preview = read("components/profile/ProfilePreview.tsx");

function model(
  overrides: Partial<Omit<ProfileCommandCenterModel, "nextAction">> = {}
): Omit<ProfileCommandCenterModel, "nextAction"> {
  return {
    identity: {
      id: "user-1",
      username: "ada",
      fullName: "Ada Nwosu",
      avatarUrl: null,
      coverImageUrl: null,
      profileType: "professional",
      secondaryProfileTypes: [],
      verified: false,
      verifiedType: null,
      isAlumni: false,
    },
    focus: { positioningStatement: "How budgets fail.", bio: "A biography." },
    background: {
      country: "Nigeria",
      university: "",
      fieldOfStudy: "",
      graduationYear: "",
      professionalTitle: "Policy researcher",
      organizationName: "",
      organizationWebsite: "",
      openToMentoring: false,
    },
    topics: {
      interests: ["Economics"],
      demonstratedTopics: [{ key: "law", label: "Law", count: 2 }],
    },
    featured: [{ postId: "p1", title: "A piece", note: "Why.", isCoAuthor: false, publishedAt: null }],
    research: {
      enabled: false,
      headline: "",
      overview: "",
      researchInterests: [],
      methods: [],
      collaborationStatus: "selective",
      preferredRoles: [],
      orcidUrl: "",
      websiteUrl: "",
    },
    opportunities: {
      talentProfileId: null,
      openToOpportunities: false,
      opportunityTypes: [],
      skills: [],
      cvUrl: "",
      linkedinUrl: "",
      visibility: "public",
    },
    visibility: {
      profileVisibility: "public",
      allowMessages: "everyone",
      showInDirectory: true,
    },
    recordSummary: {
      publicationCount: 4,
      sourceBackedCount: 2,
      citableCount: 0,
      responseCount: 0,
      debateCount: 0,
      researchCount: 0,
    },
    followerCount: 3,
    eligibleFeaturedCount: 4,
    isStudentPath: false,
    positioningEnabled: true,
    ...overrides,
  };
}

describe("command center sections", () => {
  it("covers every section the workspace promises", () => {
    expect([...PROFILE_SECTIONS]).toEqual([
      "overview",
      "identity",
      "focus",
      "topics",
      "featured",
      "background",
      "research",
      "opportunities",
      // Phase 3 added verified outcomes, which sit beside Opportunities
      // because they are what an opportunity turns into.
      "outcomes",
      "visibility",
    ]);
    for (const key of PROFILE_SECTIONS) {
      expect(PROFILE_SECTION_DEFINITIONS[key].label.length).toBeGreaterThan(0);
      expect(PROFILE_SECTION_DEFINITIONS[key].summary.length).toBeGreaterThan(10);
    }
  });

  it("hides Research entirely when the feature is off", () => {
    expect(getVisibleProfileSections(model())).not.toContain("research");
    expect(
      getVisibleProfileSections(
        model({ research: { ...model().research, enabled: true } })
      )
    ).toContain("research");
  });

  it("recognizes its own section keys and nothing else", () => {
    expect(isProfileSectionKey("identity")).toBe(true);
    expect(isProfileSectionKey("account")).toBe(false);
    expect(isProfileSectionKey(null)).toBe(false);
  });

  it("does not own account, password or notification settings", () => {
    for (const foreign of ["account", "password", "notifications", "security"]) {
      expect(PROFILE_SECTIONS).not.toContain(foreign);
    }
  });
});

describe("command center next-action state", () => {
  it("derives the engine's state from the model, so the two agree", () => {
    const state = toNextActionState(model());
    expect(state.username).toBe("ada");
    expect(state.record.publicationCount).toBe(4);
    expect(state.interestCount).toBe(1);
    expect(state.demonstratedTopicCount).toBe(1);
    expect(state.featured).toEqual([{ note: "Why." }]);
    expect(state.opportunities.hasContactLink).toBe(false);
  });

  it("normalizes a whitespace-only positioning statement to absent", () => {
    const state = toNextActionState(
      model({ focus: { positioningStatement: "   ", bio: "" } })
    );
    expect(state.positioningStatement).toBeNull();
  });

  it("attaches a recommendation to the model", () => {
    const withAction = withNextAction(model({ featured: [] }));
    expect(withAction.nextAction.primary.key).toBe("select_featured");
  });
});

describe("command center data boundaries", () => {
  it("reads the three domains from their own tables rather than merging them", () => {
    expect(loader).toContain('from("profiles")');
    expect(loader).toContain('from("researcher_profiles")');
    expect(loader).toContain('from("talent_profiles")');
    // Nothing writes opportunity or research data into the public profile row.
    expect(actions).not.toMatch(
      /from\("profiles"\)[\s\S]{0,400}?(skills|opportunity_types|cv_url|research_interests)/
    );
  });

  it("reads private owner state through the hardened RPCs", () => {
    expect(loader).toContain('rpc("get_my_profile_private")');
    expect(loader).toContain('rpc("get_my_onboarding_state")');
  });

  it("never lets private opportunity or onboarding data into the preview", () => {
    // The preview's own contract: it takes a public profile shape, topics, a
    // record summary and featured work. There is no field on it that could
    // carry readiness, skills, CV links or the onboarding path.
    for (const privateField of [
      "cvUrl",
      "cv_url",
      "linkedinUrl",
      "skills",
      "readiness",
      "workCategory",
      "work_category",
      "currentPath",
      "signup_email",
    ]) {
      expect(preview).not.toContain(privateField);
    }
    // The command center passes only the boolean an ordinary visitor could
    // already infer from the badge.
    expect(commandCenter).toContain("isOpenToOpportunities:");
    expect(commandCenter).not.toMatch(/previewData[\s\S]{0,2000}skills/);
  });

  it("keeps the private onboarding path as a flag, never as preview data", () => {
    expect(loader).toContain("isStudentPath");
    expect(loader).not.toMatch(/return withNextAction\([\s\S]*workCategory/);
  });
});

describe("legacy profile editor routes", () => {
  it("redirects the old settings tab to the canonical route", () => {
    expect(settingsPage).toContain('if (rawTab === "profile") {');
    expect(settingsPage).toContain('redirect("/settings/profile")');
  });

  it("no longer renders a second profile editor", () => {
    expect(settingsPage).not.toContain("<ProfileForm");
    expect(settingsPage).not.toContain('{ value: "profile", label: "Profile" }');
  });

  it("keeps the anchors the public profile has always linked to", () => {
    const identity = read("app/(main)/settings/profile/sections/IdentitySection.tsx");
    const focus = read("app/(main)/settings/profile/sections/FocusSection.tsx");
    expect(identity).toContain('id="profile-identity"');
    expect(focus).toContain('id="profile-about"');
  });

  it("points the research and opportunity editors at the canonical route", () => {
    expect(read("app/(main)/research/profile/page.tsx")).toContain(
      "/settings/profile#research"
    );
    expect(read("components/opportunities/OpportunityProfileEditor.tsx")).toContain(
      "/settings/profile#opportunities"
    );
  });
});
