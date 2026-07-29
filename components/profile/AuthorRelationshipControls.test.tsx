import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthorRelationshipControls from "./AuthorRelationshipControls";
import { setAuthorSubscription, toggleFollow } from "@/components/ui/followActions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/post/ubuntu",
  useSearchParams: () => new URLSearchParams("ref=profile"),
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/components/ui/followActions", () => ({
  setAuthorSubscription: vi.fn(),
  toggleFollow: vi.fn(),
}));

const mockedSubscription = vi.mocked(setAuthorSubscription);
const mockedFollow = vi.mocked(toggleFollow);

describe("AuthorRelationshipControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
  });

  it("subscribes optimistically and auto-follows", async () => {
    mockedSubscription.mockResolvedValue({
      error: null,
      following: true,
      subscribed: true,
      followCreated: true,
    });
    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing={false}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Subscribe to author publications" })
    );

    expect(screen.getByRole("button", { name: "Unfollow author" })).toHaveTextContent(
      "Following"
    );
    await waitFor(() => {
      expect(mockedSubscription).toHaveBeenCalledWith({
        authorId: "author",
        subscribed: true,
        pathname: "/post/ubuntu",
      });
    });
    expect(screen.getByText(/All work will appear in-app/)).toBeInTheDocument();
  });

  it("unsubscribes while retaining Follow", async () => {
    mockedSubscription.mockResolvedValue({
      error: null,
      following: true,
      subscribed: false,
      followCreated: false,
    });
    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing
        initialSubscribed
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Unsubscribe from author publications" })
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Unfollow author" })).toHaveTextContent(
        "Following"
      );
    });
    expect(screen.getByText(/still following this author/i)).toBeInTheDocument();
  });

  it("unfollowing removes both local relationship states", async () => {
    mockedFollow.mockResolvedValue({
      error: null,
      following: false,
      subscribed: false,
    });
    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId="reader"
        initialFollowing
        initialSubscribed
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Unfollow author" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Subscribe to author publications" })
      ).toHaveTextContent("Subscribe");
    });
    expect(mockedFollow).toHaveBeenCalledWith({
      followingId: "author",
      follow: false,
      pathname: "/post/ubuntu",
    });
  });

  it("redirects guests to login with the full destination", async () => {
    render(
      <AuthorRelationshipControls
        authorId="author"
        currentUserId={null}
        initialFollowing={false}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Subscribe to author publications" })
    );
    expect(push).toHaveBeenCalledWith(
      `/login?redirectTo=${encodeURIComponent("/post/ubuntu?ref=profile")}`
    );
    expect(mockedSubscription).not.toHaveBeenCalled();
  });
});
