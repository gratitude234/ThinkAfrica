import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthorRelationshipControls from "./AuthorRelationshipControls";
import AuthorRelationshipProvider from "./AuthorRelationshipProvider";
import { setAuthorSubscription, toggleFollow } from "@/components/ui/followActions";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/post/ubuntu",
  useSearchParams: () => new URLSearchParams("ref=feed"),
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/components/ui/followActions", () => ({
  setAuthorSubscription: vi.fn(),
  toggleFollow: vi.fn(),
}));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: vi.fn(),
}));

const mockedSubscription = vi.mocked(setAuthorSubscription);
const mockedFollow = vi.mocked(toggleFollow);

function renderShared({
  following = false,
  subscribed = false,
  currentUserId = "reader",
}: {
  following?: boolean;
  subscribed?: boolean;
  currentUserId?: string | null;
} = {}) {
  return render(
    <AuthorRelationshipProvider
      authorId="author"
      authorName="Ama"
      currentUserId={currentUserId}
      initialFollowing={following}
      initialSubscribed={subscribed}
      postId="post-id"
    >
      <AuthorRelationshipControls
        authorId="author"
        authorName="Ama"
        currentUserId={currentUserId}
        initialFollowing={following}
        initialSubscribed={subscribed}
        source="post_header"
        variant="icon"
      />
      <AuthorRelationshipControls
        authorId="author"
        authorName="Ama"
        currentUserId={currentUserId}
        initialFollowing={following}
        initialSubscribed={subscribed}
        source="author_card"
        variant="compact"
      />
    </AuthorRelationshipProvider>
  );
}

describe("AuthorRelationshipProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
  });

  it("synchronizes every control when Subscribe auto-follows", async () => {
    mockedSubscription.mockResolvedValue({
      error: null,
      following: true,
      subscribed: true,
      followCreated: true,
      subscriptionCreated: true,
    });
    renderShared();

    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Subscribe to Ama's publications",
      })[0]
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Unfollow Ama" })
      ).toHaveLength(2);
      expect(
        screen.getAllByRole("button", {
          name: "Unsubscribe from Ama's publications",
        })
      ).toHaveLength(2);
    });
  });

  it("confirms that unfollowing a subscriber stops updates", async () => {
    mockedFollow.mockResolvedValue({
      error: null,
      following: false,
      subscribed: false,
    });
    renderShared({ following: true, subscribed: true });

    await userEvent.click(
      screen.getAllByRole("button", { name: "Unfollow Ama" })[0]
    );
    const dialog = screen.getByRole("dialog", { name: "Unfollow Ama?" });
    expect(
      within(dialog).getByText("This also stops publication updates from this author.")
    ).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Unfollow & unsubscribe",
      })
    );

    await waitFor(() => {
      expect(mockedFollow).toHaveBeenCalledWith(
        expect.objectContaining({
          followingId: "author",
          follow: false,
          surface: "post_header",
          postId: "post-id",
        })
      );
    });
  });

  it("preserves a guest's destination and asks again after login", async () => {
    renderShared({ currentUserId: null });
    await userEvent.click(
      screen.getAllByRole("button", {
        name: "Subscribe to Ama's publications",
      })[0]
    );

    expect(push).toHaveBeenCalledWith(
      `/login?redirectTo=${encodeURIComponent("/post/ubuntu?ref=feed")}`
    );
    expect(mockedSubscription).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("indegenius:author-relationship-intent"))
      .toContain('"action":"subscribe"');
  });
});
