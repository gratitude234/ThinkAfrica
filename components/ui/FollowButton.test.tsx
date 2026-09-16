import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FollowButton from "./FollowButton";
import { toggleFollow } from "@/components/ui/followActions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/ada",
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/components/ui/followActions", () => ({
  toggleFollow: vi.fn(),
}));

const trackActivationEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/activationEvents", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/activationEvents")>()),
  trackActivationEvent,
}));

const mockedFollow = vi.mocked(toggleFollow);

describe("FollowButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers exactly one control, named Follow", () => {
    render(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing={false}
        authorName="Ada Obi"
        source="profile"
      />
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("Follow");
    expect(buttons[0]).toHaveAccessibleName("Follow Ada Obi");
  });

  it("says Following for a member the reader already follows", () => {
    render(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing
        source="profile"
      />
    );

    expect(screen.getByRole("button")).toHaveTextContent("Following");
  });

  it("renders nothing on the reader's own work", () => {
    const { container } = render(
      <FollowButton
        followingId="reader"
        currentUserId="reader"
        initialFollowing={false}
        source="post_header"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("follows, records the event and refreshes once the server confirms", async () => {
    mockedFollow.mockResolvedValue({ error: null, following: true });
    const onFollowCompleted = vi.fn();

    render(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing={false}
        source="post_header"
        postId="post-1"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => expect(onFollowCompleted).toHaveBeenCalledTimes(1));
    expect(mockedFollow).toHaveBeenCalledWith({
      followingId: "author",
      follow: true,
      pathname: "/ada",
    });
    expect(trackActivationEvent).toHaveBeenCalledWith({
      event: "writer_followed",
      source: "post_header",
      metadata: { authorId: "author", postId: "post-1" },
    });
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveTextContent("Following");
  });

  it("reverts and explains when the follow write fails", async () => {
    mockedFollow.mockResolvedValue({ error: "You cannot follow this member.", following: false });
    const onFollowCompleted = vi.fn();

    render(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing={false}
        source="profile"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button")).toHaveTextContent("Follow");
    expect(onFollowCompleted).not.toHaveBeenCalled();
    expect(trackActivationEvent).not.toHaveBeenCalled();
  });

  it("unfollows without counting a follow", async () => {
    mockedFollow.mockResolvedValue({ error: null, following: false });
    const onFollowCompleted = vi.fn();

    render(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing
        source="profile"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Following" }));

    await waitFor(() =>
      expect(mockedFollow).toHaveBeenCalledWith(
        expect.objectContaining({ followingId: "author", follow: false })
      )
    );
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Follow"));
    expect(onFollowCompleted).not.toHaveBeenCalled();
    expect(trackActivationEvent).not.toHaveBeenCalled();
  });

  it("sends a signed-out reader to sign in rather than counting a conversion", async () => {
    const onFollowCompleted = vi.fn();

    render(
      <FollowButton
        followingId="author"
        currentUserId={null}
        initialFollowing={false}
        source="explore"
        onFollowCompleted={onFollowCompleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Follow" }));

    expect(push).toHaveBeenCalledWith(expect.stringContaining("/login?redirectTo="));
    expect(mockedFollow).not.toHaveBeenCalled();
    expect(onFollowCompleted).not.toHaveBeenCalled();
  });

  it("adopts a new initial state handed down after a refresh", () => {
    const { rerender } = render(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing={false}
        source="author_card"
      />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Follow");

    rerender(
      <FollowButton
        followingId="author"
        currentUserId="reader"
        initialFollowing
        source="author_card"
      />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Following");
  });
});
