import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthorRelationshipControls from "./AuthorRelationshipControls";
import ProfileStickyBar from "./ProfileStickyBar";
import { toggleFollow } from "@/components/ui/followActions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/ada",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/components/ui/followActions", () => ({
  setAuthorSubscription: vi.fn(),
  toggleFollow: vi.fn(),
}));

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const mockedFollow = vi.mocked(toggleFollow);

describe("follow completion signal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a follow only after the server confirms it", async () => {
    mockedFollow.mockResolvedValue({
      error: null,
      following: true,
      subscribed: false,
    });
    const onFollowCompleted = vi.fn();

    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing={false}
        source="profile"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow author" }));
    await waitFor(() => expect(onFollowCompleted).toHaveBeenCalledTimes(1));
  });

  it("reports nothing when the follow write fails", async () => {
    mockedFollow.mockResolvedValue({
      error: "Unable to update this relationship.",
      following: false,
      subscribed: false,
    });
    const onFollowCompleted = vi.fn();

    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing={false}
        source="profile"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow author" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onFollowCompleted).not.toHaveBeenCalled();
  });

  it("reports nothing when an unfollow succeeds", async () => {
    mockedFollow.mockResolvedValue({
      error: null,
      following: false,
      subscribed: false,
    });
    const onFollowCompleted = vi.fn();

    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing
        source="profile"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Unfollow author" }));
    await waitFor(() => expect(mockedFollow).toHaveBeenCalled());
    expect(onFollowCompleted).not.toHaveBeenCalled();
  });

  it("sends an anonymous reader to sign in rather than counting a conversion", async () => {
    const onFollowCompleted = vi.fn();

    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId={null}
        initialFollowing={false}
        source="profile"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow author" }));
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/login?redirectTo="));
    expect(mockedFollow).not.toHaveBeenCalled();
    expect(onFollowCompleted).not.toHaveBeenCalled();
  });

  it("preserves the profile relationship source it always sent", async () => {
    mockedFollow.mockResolvedValue({
      error: null,
      following: true,
      subscribed: false,
    });

    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing={false}
        source="profile"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow author" }));
    await waitFor(() =>
      expect(mockedFollow).toHaveBeenCalledWith(
        expect.objectContaining({ followingId: "author", follow: true })
      )
    );
  });
});

describe("sticky bar attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("attributes a follow completed on the bar to the bar", async () => {
    mockedFollow.mockResolvedValue({
      error: null,
      following: true,
      subscribed: false,
    });

    render(
      <ProfileStickyBar
        authorId="author-1"
        authorName="Ada"
        avatarUrl={null}
        currentUserId="reader"
        initialFollowing={false}
        viewerState="authenticated"
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow author" }));

    await waitFor(() =>
      expect(trackActivationEvent).toHaveBeenCalledWith({
        event: "profile_follow_completed",
        source: "sticky_bar",
        metadata: {
          profileId: "author-1",
          viewerState: "authenticated",
          surface: "sticky_bar",
        },
      })
    );
  });
});
