import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProfileIdentityLines } from "@/lib/profileIdentity";
import ProfileHeader from "./ProfileHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/student1",
  useSearchParams: () => new URLSearchParams(),
}));

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
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
    positioning_statement: null,
    ...overrides,
  };
}

const POPULATED_RECORD = {
  publicationCount: 5,
  sourceBackedCount: 3,
  citableCount: 1,
  responseCount: 4,
  debateCount: 2,
  researchCount: 0,
};

const EMPTY_RECORD = {
  publicationCount: 0,
  sourceBackedCount: 0,
  citableCount: 0,
  responseCount: 0,
  debateCount: 0,
  researchCount: 0,
};

const TOPICS = [
  { key: "governance", label: "Governance", count: 4 },
  { key: "history", label: "History", count: 2 },
  { key: "policy", label: "Policy", count: 1 },
  { key: "economics", label: "Economics", count: 1 },
];

function renderHeader({
  profileOverrides = {},
  props = {},
}: {
  profileOverrides?: Partial<Parameters<typeof ProfileHeader>[0]["profile"]>;
  props?: Partial<Parameters<typeof ProfileHeader>[0]>;
} = {}) {
  return render(
    <ProfileHeader
      profile={baseProfile(profileOverrides)}
      demonstratedTopics={TOPICS}
      recordSummary={POPULATED_RECORD}
      followerCount={12}
      isOwnProfile
      currentUserId="user-1"
      initialFollowing={false}
      isOpenToOpportunities={false}
      canContact={false}
      talentProfileId={null}
      {...props}
    />
  );
}

describe("ProfileHeader identity", () => {
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
      positioning: null,
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
      positioning: null,
    });
  });
});

describe("ProfileHeader intellectual focus", () => {
  const focus =
    "Why Nigerian state budgets rarely survive contact with local government.";

  it("renders the positioning statement as prose, not as a badge", () => {
    renderHeader({ profileOverrides: { positioning_statement: focus } });

    const statement = screen.getByText(focus);
    expect(statement).toBeInTheDocument();
    // It reads as the author's own sentence: no chip, no role, nothing that
    // would present it as a title the platform conferred.
    expect(statement.tagName).toBe("P");
    expect(statement).not.toHaveAttribute("role");
  });

  it("shows a visitor nothing when the author has not written one", () => {
    renderHeader({
      props: { isOwnProfile: false, currentUserId: "someone-else" },
    });

    expect(
      screen.queryByRole("link", { name: /intellectual focus/i })
    ).not.toBeInTheDocument();
  });

  it("offers the owner a way to add one", () => {
    renderHeader();

    expect(
      screen.getByRole("link", { name: /Add your intellectual focus/i })
    // Phase 2 moved profile editing to its own canonical route.
    ).toHaveAttribute("href", "/settings/profile#focus");
  });

  it("collapses pasted line breaks into one line", () => {
    renderHeader({
      profileOverrides: { positioning_statement: "First line.\n\n  Second line." },
    });

    expect(screen.getByText("First line. Second line.")).toBeInTheDocument();
  });
});

describe("ProfileHeader record metrics", () => {
  it("links every metric that has a value", () => {
    renderHeader({ profileOverrides: { verified: true, verified_type: "student" } });

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

  it("hides a metric that is zero and keeps the ones that are not", () => {
    renderHeader({
      props: {
        recordSummary: { ...POPULATED_RECORD, sourceBackedCount: 0, citableCount: 0 },
      },
    });

    expect(screen.getByText("Publications")).toBeInTheDocument();
    expect(screen.queryByText("Source-backed")).not.toBeInTheDocument();
    expect(screen.queryByText("Citable")).not.toBeInTheDocument();
  });

  it("adapts the grid to one, two or three visible metrics", () => {
    const grid = (summary: typeof POPULATED_RECORD) => {
      const { container, unmount } = render(
        <ProfileHeader
          profile={baseProfile()}
          demonstratedTopics={TOPICS}
          recordSummary={summary}
          followerCount={0}
          isOwnProfile={false}
          currentUserId={null}
          initialFollowing={false}
          isOpenToOpportunities={false}
          canContact={false}
          talentProfileId={null}
        />
      );
      const node = container.querySelector("[class*='grid-cols-']");
      const className = node?.className ?? "";
      unmount();
      return className;
    };

    expect(grid({ ...POPULATED_RECORD, sourceBackedCount: 0, citableCount: 0 })).toContain(
      "grid-cols-1"
    );
    expect(grid({ ...POPULATED_RECORD, citableCount: 0 })).toContain("grid-cols-2");
    expect(grid(POPULATED_RECORD)).toContain("grid-cols-3");
  });

  it("shows a visitor no metrics at all when the record is empty", () => {
    renderHeader({
      props: {
        recordSummary: EMPTY_RECORD,
        isOwnProfile: false,
        currentUserId: "someone-else",
      },
    });

    expect(screen.queryByText("Publications")).not.toBeInTheDocument();
    expect(screen.queryByText("Source-backed")).not.toBeInTheDocument();
    expect(screen.queryByText("Citable")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("Intellectual Record")).not.toBeInTheDocument();
  });

  it("gives the owner a next action instead of zeroes, and no completion score", () => {
    renderHeader({ props: { recordSummary: EMPTY_RECORD } });

    expect(
      screen.getByRole("link", { name: /Publish your first contribution/i })
    ).toHaveAttribute("href", "/write");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/complete/i)).not.toBeInTheDocument();
  });

  it("explains each metric without hover, on an accessible disclosure", async () => {
    const user = userEvent.setup();
    renderHeader();

    const trigger = screen.getByRole("button", { name: "What these mean" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("group", {
        name: "What the Intellectual Record metrics mean",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Publications carrying at least one structured source/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not popularity counts or an overall quality score/i)
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});

describe("ProfileHeader topics", () => {
  it("limits the visible demonstrated topics to three and labels the group", () => {
    renderHeader();

    expect(
      screen.getByRole("list", { name: "Demonstrated topics" })
    ).toBeInTheDocument();
    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("Policy")).toBeInTheDocument();
    expect(screen.queryByText("Economics")).not.toBeInTheDocument();
  });

  it("links each topic to the record filter that holds its work", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: /^Governance/ })).toHaveAttribute(
      "href",
      "/student1/record?topic=governance"
    );
    // The count comes from the same pass that ranked the topic, so a chip can
    // say how much work is behind it without a query per topic.
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows a visitor nothing when the author has demonstrated no topics", () => {
    renderHeader({
      props: {
        demonstratedTopics: [],
        isOwnProfile: false,
        currentUserId: "someone-else",
      },
    });

    expect(
      screen.queryByRole("list", { name: "Demonstrated topics" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Topics appear here/i)).not.toBeInTheDocument();
  });

  it("guides the owner when they have demonstrated no topics", () => {
    renderHeader({ props: { demonstratedTopics: [] } });

    expect(
      screen.getByText(/Topics appear here once you publish work tagged with them/i)
    ).toBeInTheDocument();
  });
});

describe("ProfileHeader funnel instrumentation", () => {
  beforeEach(() => {
    trackActivationEvent.mockClear();
  });

  it("records one profile view after render, with no personal data", () => {
    renderHeader({
      props: { isOwnProfile: false, currentUserId: "viewer-9" },
    });

    const views = trackActivationEvent.mock.calls.filter(
      ([payload]) => payload.event === "profile_viewed"
    );
    expect(views).toHaveLength(1);
    expect(views[0][0]).toEqual({
      event: "profile_viewed",
      source: "profile_header",
      metadata: {
        profileId: "user-1",
        viewerState: "authenticated",
        surface: "profile_header",
      },
    });
  });

  it("does not send a second view when the header rerenders", () => {
    const { rerender } = render(
      <ProfileHeader
        profile={baseProfile()}
        demonstratedTopics={TOPICS}
        recordSummary={POPULATED_RECORD}
        followerCount={1}
        isOwnProfile={false}
        currentUserId={null}
        initialFollowing={false}
        isOpenToOpportunities={false}
        canContact={false}
        talentProfileId={null}
      />
    );
    rerender(
      <ProfileHeader
        profile={baseProfile()}
        demonstratedTopics={TOPICS}
        recordSummary={POPULATED_RECORD}
        followerCount={2}
        isOwnProfile={false}
        currentUserId={null}
        initialFollowing={false}
        isOpenToOpportunities={false}
        canContact={false}
        talentProfileId={null}
      />
    );

    expect(
      trackActivationEvent.mock.calls.filter(
        ([payload]) => payload.event === "profile_viewed"
      )
    ).toHaveLength(1);
  });

  it("distinguishes an anonymous visitor from the owner", () => {
    renderHeader({ props: { isOwnProfile: false, currentUserId: null } });
    expect(trackActivationEvent.mock.calls[0][0].metadata.viewerState).toBe(
      "anonymous"
    );

    trackActivationEvent.mockClear();
    renderHeader();
    expect(trackActivationEvent.mock.calls[0][0].metadata.viewerState).toBe("owner");
  });
});
