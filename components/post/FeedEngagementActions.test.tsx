import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeedEngagementActions from "./FeedEngagementActions";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  like: vi.fn(),
  bookmark: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/app/(main)/post/[slug]/likeActions", () => ({
  togglePostLike: mocks.like,
}));

vi.mock("@/app/(main)/post/[slug]/bookmarkActions", () => ({
  toggleBookmark: mocks.bookmark,
}));

function renderActions(userId: string | null = "user-1") {
  return render(
    <FeedEngagementActions
      postId="post-1"
      slug="a-good-article"
      userId={userId}
      initialLiked={false}
      initialLikeCount={4}
      initialBookmarked={false}
      responseCount={3}
    />
  );
}

describe("FeedEngagementActions", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.like.mockReset();
    mocks.bookmark.mockReset();
    window.history.replaceState(null, "", "/?tab=home&type=article");
  });

  it("optimistically likes and reconciles the server count", async () => {
    mocks.like.mockResolvedValue({ error: null, liked: true, count: 8 });
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Like this item" }));
    expect(screen.getByText("5")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("8")).toBeInTheDocument());
    expect(mocks.like).toHaveBeenCalledWith({ postId: "post-1", nextLiked: true });
  });

  it("rolls a failed like back and exposes the error", async () => {
    mocks.like.mockResolvedValue({ error: "Try again later", liked: false, count: 4 });
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Like this item" }));

    await waitFor(() => expect(screen.getByText("Try again later")).toBeInTheDocument());
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like this item" })).toHaveAttribute("aria-pressed", "false");
  });

  it("optimistically saves and keeps the returned state", async () => {
    mocks.bookmark.mockResolvedValue({ error: null, bookmarked: true });
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Save for later" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Remove from saved" })).toBeInTheDocument());
    expect(mocks.bookmark).toHaveBeenCalledWith({ postId: "post-1", nextBookmarked: true });
  });

  it("sends guests to login with the complete feed return path", () => {
    renderActions(null);

    fireEvent.click(screen.getByRole("button", { name: "Like this item" }));

    expect(mocks.push).toHaveBeenCalledWith(
      "/login?redirectTo=%2F%3Ftab%3Dhome%26type%3Darticle"
    );
    expect(mocks.like).not.toHaveBeenCalled();
  });
});
