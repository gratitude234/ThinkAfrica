import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

type HeaderProps = Parameters<typeof ProfileHeader>[0];

function baseProfile(
  overrides: Partial<HeaderProps["profile"]> = {}
): HeaderProps["profile"] {
  return {
    id: "user-1",
    username: "student1",
    full_name: "A Student",
    bio: "Writes about governance and institutions.",
    avatar_url: null,
    professional_title: null,
    ...overrides,
  };
}

function renderHeader({
  profileOverrides = {},
  props = {},
}: {
  profileOverrides?: Partial<HeaderProps["profile"]>;
  props?: Partial<HeaderProps>;
} = {}) {
  return render(
    <ProfileHeader
      profile={baseProfile(profileOverrides)}
      followerCount={12}
      followingCount={34}
      isOwnProfile
      currentUserId="user-1"
      initialFollowing={false}
      {...props}
    />
  );
}

describe("ProfileHeader identity", () => {
  it("shows the name, the handle and the writer's own headline", () => {
    renderHeader({ profileOverrides: { professional_title: "Policy researcher" } });

    expect(screen.getByRole("heading", { level: 1, name: "A Student" })).toBeInTheDocument();
    expect(screen.getByText("@student1")).toBeInTheDocument();
    expect(screen.getByText("Policy researcher")).toBeInTheDocument();
    // Headline and bio have separate positions in the approved hierarchy.
    expect(
      screen.queryByText("Writes about governance and institutions.")
    ).toBeInTheDocument();
  });

  it("shows the bio when the writer has no headline", () => {
    renderHeader();
    expect(
      screen.getByText("Writes about governance and institutions.")
    ).toBeInTheDocument();
  });

  it("shows nothing under the name when there is neither", () => {
    const { container } = renderHeader({ profileOverrides: { bio: null } });
    // No derived persona line and no platform filler in its place.
    expect(container.textContent).not.toMatch(/Writer on Indegenius|student\b/);
  });

  it("falls back to the username when there is no name", () => {
    renderHeader({ profileOverrides: { full_name: null } });
    expect(screen.getByRole("heading", { level: 1, name: "student1" })).toBeInTheDocument();
  });

  it("shows only the identity verification label for a verified account", () => {
    renderHeader({ profileOverrides: { verified: true } });
    expect(screen.getByRole("img", { name: "Identity verified by Indegenuis" })).toHaveAttribute("title", "Identity verified by Indegenuis");
  });

  it("does not show verification for an unverified account", () => {
    renderHeader({ profileOverrides: { verified: false } });
    expect(screen.queryByRole("img", { name: /verified/i })).not.toBeInTheDocument();
  });

  it("offers the More actions control with a readable glyph", () => {
    // The glyph was once saved double-encoded and rendered as mojibake.
    renderHeader({ props: { isOwnProfile: false, currentUserId: "reader-1" } });
    expect(screen.getByRole("button", { name: "More profile actions" })).toHaveTextContent(
      "•••"
    );
  });
});

describe("ProfileHeader carries no record and no credibility", () => {
  it("renders no Intellectual Record, metrics, topics, focus statement or cover", () => {
    const { container } = renderHeader({
      profileOverrides: { professional_title: "Policy researcher" },
    });
    const text = container.textContent ?? "";

    for (const retired of [
      /Intellectual Record/i,
      /citable/i,
      /source-backed/i,
      /intellectual focus/i,
      /recognition/i,
      /expertise/i,
      /publications?\b/i,
    ]) {
      expect(text).not.toMatch(retired);
    }
    expect(screen.queryByRole("button", { name: /cover image/i })).toBeNull();
    expect(container.querySelector('a[href*="/record"]')).toBeNull();
  });
});

describe("ProfileHeader relationship counts", () => {
  it("links both counts to the lists behind them", () => {
    renderHeader({ props: { followerCount: 12, followingCount: 34 } });

    expect(screen.getByRole("link", { name: "12 followers" })).toHaveAttribute(
      "href",
      "/student1/followers"
    );
    expect(screen.getByRole("link", { name: "34 following" })).toHaveAttribute(
      "href",
      "/student1/following"
    );
  });

  it("says one follower rather than 1 followers", () => {
    renderHeader({ props: { followerCount: 1, followingCount: 0 } });
    expect(screen.getByRole("link", { name: "1 follower" })).toBeInTheDocument();
  });

  /**
   * A zero here is a real answer to "how many people follow this person". It
   * reads as words, never as a bare "0" an eye takes for a metric.
   */
  it("prints a zero count as words, never as a bare number", () => {
    renderHeader({ props: { followerCount: 0, followingCount: 0 } });

    expect(screen.getByRole("link", { name: "0 followers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "0 following" })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("ProfileHeader actions", () => {
  it("offers the owner Edit profile and Share, and nothing to do to themselves", () => {
    renderHeader();

    expect(screen.getByRole("link", { name: "Edit profile" })).toHaveAttribute(
      "href",
      "/settings/profile"
    );
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Follow/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /message/i })).not.toBeInTheDocument();
  });

  it("offers a visitor Follow and the menu that holds Share, Report and Block", () => {
    renderHeader({ props: { isOwnProfile: false, currentUserId: "viewer-9" } });

    expect(screen.getByRole("button", { name: "Follow A Student" })).toHaveTextContent("Follow");
    expect(screen.getByRole("button", { name: "More profile actions" })).toBeInTheDocument();
    // Follow is the only relationship: no subscribe bell beside it.
    expect(screen.queryByRole("button", { name: /subscri/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /message/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit profile" })).not.toBeInTheDocument();
  });

  it("offers a signed-out reader no Message control either", () => {
    renderHeader({ props: { isOwnProfile: false, currentUserId: null } });

    expect(screen.queryByRole("button", { name: /message/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /message/i })).not.toBeInTheDocument();
  });

  /**
   * A blocked visitor is shown a profile with no relationship controls and no
   * explanation. The same header renders for both sides of a block, so saying
   * so would be a disclosure in the other direction.
   */
  it("tells a blocked visitor nothing about the block", () => {
    renderHeader({
      props: { isOwnProfile: false, currentUserId: "viewer-9", initialBlocked: true },
    });

    expect(screen.queryByRole("button", { name: /^Follow/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/block/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More profile actions" })).toBeInTheDocument();
  });
});

describe("ProfileHeader funnel instrumentation", () => {
  beforeEach(() => {
    trackActivationEvent.mockClear();
  });

  it("records one profile view after render, with no personal data", () => {
    renderHeader({ props: { isOwnProfile: false, currentUserId: "viewer-9" } });

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
    const props = {
      profile: baseProfile(),
      followingCount: 0,
      isOwnProfile: false,
      currentUserId: null,
      initialFollowing: false,
    };
    const { rerender } = render(<ProfileHeader {...props} followerCount={1} />);
    rerender(<ProfileHeader {...props} followerCount={2} />);

    expect(
      trackActivationEvent.mock.calls.filter(
        ([payload]) => payload.event === "profile_viewed"
      )
    ).toHaveLength(1);
  });

  it("distinguishes an anonymous visitor from the owner", () => {
    renderHeader({ props: { isOwnProfile: false, currentUserId: null } });
    expect(trackActivationEvent.mock.calls[0][0].metadata.viewerState).toBe("anonymous");

    trackActivationEvent.mockClear();
    renderHeader();
    expect(trackActivationEvent.mock.calls[0][0].metadata.viewerState).toBe("owner");
  });
});
