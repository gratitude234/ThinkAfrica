import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  fetchCommentPage: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/commentThread", () => ({ fetchCommentPage: mocks.fetchCommentPage }));
vi.mock("./CommentThread", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import CommentsLoader from "./CommentsLoader";
import CommentThread from "./CommentThread";
import CommentsUnavailable from "./CommentsUnavailable";

const props = {
  postId: "post-1",
  userId: null,
  userProfileId: null,
  showHeading: false,
  totalCount: 3,
};

describe("CommentsLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders the thread when the comments load", async () => {
    mocks.fetchCommentPage.mockResolvedValue({
      comments: [],
      hasMore: false,
      nextCursor: null,
      userVotedCommentIds: [],
    });
    const element = await CommentsLoader(props);
    expect(element.type).toBe(CommentThread);
  });

  it("keeps the failure to the comments when they do not load", async () => {
    mocks.fetchCommentPage.mockRejectedValue(
      new Error("comment replies failed: SupabaseTimeoutError: Supabase did not respond within 8000ms.")
    );
    const element = await CommentsLoader(props);
    expect(element.type).toBe(CommentsUnavailable);
  });
});

describe("CommentsUnavailable", () => {
  it("says the comments did not load and refreshes on Try again", () => {
    render(<CommentsUnavailable />);
    expect(screen.getByRole("alert").textContent).toContain("Comments didn't load.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
