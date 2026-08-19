import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadComment } from "@/lib/commentThread";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    submitComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    loadMoreComments: vi.fn(),
    requestAuth: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("./commentActions", () => ({
  submitComment: mocks.submitComment,
  updateComment: mocks.updateComment,
  deleteComment: mocks.deleteComment,
  loadMoreComments: mocks.loadMoreComments,
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/components/moderation/ReportButton", () => ({
  default: () => <button type="button">Report</button>,
}));

import CommentThread from "./CommentThread";

function comment(overrides: Partial<ThreadComment> = {}): ThreadComment {
  return {
    id: "c1",
    content: "First thought.",
    created_at: "2026-08-02T10:00:00.000Z",
    updated_at: null,
    upvotes: 2,
    parent_id: null,
    author_id: "author-1",
    profiles: { username: "amara", full_name: "Amara Okafor", avatar_url: null },
    replies: [],
    replyCount: 0,
    ...overrides,
  };
}

function renderThread(props: Partial<Parameters<typeof CommentThread>[0]> = {}) {
  return render(
    <CommentThread
      postId="post-1"
      initialComments={[comment()]}
      initialTotalCount={1}
      initialHasMore={false}
      initialCursor={null}
      userId="viewer-1"
      userProfileId="viewer-1"
      userVotedCommentIds={[]}
      {...props}
    />
  );
}

beforeEach(() => {
  mocks.submitComment.mockReset().mockResolvedValue({
    error: null,
    comment: {
      id: "c2",
      content: "A reply.",
      created_at: "2026-08-02T11:00:00.000Z",
      updated_at: null,
      upvotes: 0,
      parent_id: "c1",
      author_id: "viewer-1",
      profiles: { username: "viewer", full_name: "A Viewer", avatar_url: null },
    },
  });
  mocks.updateComment.mockReset().mockResolvedValue({ error: null });
  mocks.deleteComment.mockReset().mockResolvedValue({ error: null, tombstoned: false });
  mocks.loadMoreComments.mockReset();
  mocks.requestAuth.mockReset();
  mocks.rpc.mockReset().mockResolvedValue({ data: { voted: true, upvotes: 3 }, error: null });
});

describe("CommentThread", () => {
  it("shows the count and the comment with its time", () => {
    renderThread();
    expect(screen.getByText("Comments · 1")).toBeInTheDocument();
    expect(screen.getByText("First thought.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upvote this comment" })).toBeInTheDocument();
  });

  it("upvotes optimistically and adopts the server's count", async () => {
    renderThread();
    const upvote = screen.getByRole("button", { name: "Upvote this comment" });

    fireEvent.click(upvote);
    // Optimistic, before the RPC resolves.
    expect(screen.getByRole("button", { name: "Remove upvote" })).toHaveTextContent("3");

    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("toggle_comment_vote", { p_comment_id: "c1" })
    );
  });

  it("rolls the vote back when the RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Comment not found." } });
    renderThread();

    fireEvent.click(screen.getByRole("button", { name: "Upvote this comment" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Upvote this comment" })).toHaveTextContent("2")
    );
  });

  it("sends a guest to the auth gate instead of voting", () => {
    renderThread({ userId: null, userProfileId: null });

    fireEvent.click(screen.getByRole("button", { name: "Upvote this comment" }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("like", { contentKind: "post" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("posts a reply against the parent and shows it in the thread", async () => {
    renderThread();

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByLabelText("Write a reply"), {
      target: { value: "A reply." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() =>
      expect(mocks.submitComment).toHaveBeenCalledWith({
        postId: "post-1",
        content: "A reply.",
        parentId: "c1",
      })
    );
    await waitFor(() => expect(screen.getByText("A reply.")).toBeInTheDocument());
    expect(screen.getByText("Comments · 2")).toBeInTheDocument();
  });

  it("offers Edit and Delete only on your own comment", () => {
    const { unmount } = renderThread();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    unmount();

    renderThread({ initialComments: [comment({ author_id: "viewer-1" })] });
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("asks before deleting, and deletes nothing if you back out", async () => {
    renderThread({ initialComments: [comment({ author_id: "viewer-1" })] });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText(/Delete this comment\?/)).toBeInTheDocument();
    expect(mocks.deleteComment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Delete this comment\?/)).toBeNull();
    expect(mocks.deleteComment).not.toHaveBeenCalled();
    expect(screen.getByText("First thought.")).toBeInTheDocument();
  });

  it("says the replies survive when the comment being deleted has some", () => {
    renderThread({
      initialComments: [
        comment({
          author_id: "viewer-1",
          replies: [comment({ id: "r1", content: "A reply.", parent_id: "c1" })],
        }),
      ],
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(screen.getByText(/The replies to it stay\./)).toBeInTheDocument();
  });

  it("keeps a deleted comment in place as a tombstone when it has replies", async () => {
    mocks.deleteComment.mockResolvedValue({ error: null, tombstoned: true });
    renderThread({ initialComments: [comment({ author_id: "viewer-1" })] });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText("[deleted]")).toBeInTheDocument());
  });

  it("removes a deleted comment outright when nothing replied to it", async () => {
    renderThread({ initialComments: [comment({ author_id: "viewer-1" })] });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByText("First thought.")).toBeNull());
    expect(screen.getByText("Comments · 0")).toBeInTheDocument();
  });

  it("appends the next page and hides the control when exhausted", async () => {
    mocks.loadMoreComments.mockResolvedValue({
      error: null,
      page: {
        comments: [comment({ id: "c9", content: "Older thought." })],
        hasMore: false,
        nextCursor: null,
        userVotedCommentIds: [],
      },
    });
    renderThread({ initialHasMore: true, initialCursor: "2026-08-02T10:00:00.000Z" });

    fireEvent.click(screen.getByRole("button", { name: "Load more comments" }));

    await waitFor(() => expect(screen.getByText("Older thought.")).toBeInTheDocument());
    expect(mocks.loadMoreComments).toHaveBeenCalledWith({
      postId: "post-1",
      cursor: "2026-08-02T10:00:00.000Z",
      sort: "top",
    });
    expect(screen.queryByRole("button", { name: "Load more comments" })).toBeNull();
  });

  it("re-reads page one under the chosen sort", async () => {
    mocks.loadMoreComments.mockResolvedValue({
      error: null,
      page: {
        comments: [comment({ id: "c9", content: "Freshest thought." })],
        hasMore: false,
        nextCursor: null,
        userVotedCommentIds: [],
      },
    });
    renderThread({
      initialComments: [comment(), comment({ id: "c2", content: "Second thought." })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Newest" }));

    await waitFor(() =>
      expect(screen.getByText("Freshest thought.")).toBeInTheDocument()
    );
    // Page one, not an append: the old order is replaced, not extended.
    expect(mocks.loadMoreComments).toHaveBeenCalledWith({
      postId: "post-1",
      cursor: null,
      sort: "new",
    });
    expect(screen.queryByText("First thought.")).toBeNull();
  });

  it("hides the sort control when there is nothing to reorder", () => {
    renderThread();
    expect(screen.queryByRole("button", { name: "Newest" })).toBeNull();
  });

  it("surfaces a load-more failure without losing what is already shown", async () => {
    mocks.loadMoreComments.mockResolvedValue({ error: "Network unavailable." });
    renderThread({ initialHasMore: true, initialCursor: "cursor" });

    fireEvent.click(screen.getByRole("button", { name: "Load more comments" }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Network unavailable.")
    );
    expect(screen.getByText("First thought.")).toBeInTheDocument();
  });

  it("renders replies under their parent", () => {
    renderThread({
      initialComments: [
        comment({
          replies: [
            {
              id: "r1",
              content: "Answering that.",
              created_at: "2026-08-02T12:00:00.000Z",
              updated_at: null,
              upvotes: 0,
              parent_id: "c1",
              author_id: "author-2",
              profiles: { username: "kofi", full_name: "Kofi M", avatar_url: null },
            },
          ],
          replyCount: 1,
        }),
      ],
      initialTotalCount: 2,
    });

    const replyList = screen.getByText("Answering that.").closest("ul") as HTMLElement;
    expect(within(replyList).getByText("Kofi M")).toBeInTheDocument();
    // Threading still stops at one level, but a reply can now be answered:
    // it posts to the same parent with the addressee mentioned.
    expect(screen.getAllByRole("button", { name: "Reply" })).toHaveLength(2);
  });

  it("answers a reply at the same level, with the addressee mentioned", () => {
    renderThread({
      initialComments: [
        comment({
          replies: [
            {
              id: "r1",
              content: "Answering that.",
              created_at: "2026-08-03T10:00:00.000Z",
              updated_at: null,
              upvotes: 0,
              parent_id: "c1",
              author_id: "author-2",
              profiles: { username: "kofi", full_name: "Kofi M", avatar_url: null },
            },
          ],
          replyCount: 1,
        }),
      ],
    });

    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[1]);

    expect(screen.getByLabelText("Write a reply")).toHaveValue("@kofi ");
  });

  it("collapses a long reply chain and opens it on request", () => {
    const replies = Array.from({ length: 5 }, (_, index) => ({
      id: `r${index}`,
      content: `Reply number ${index}.`,
      created_at: "2026-08-03T10:00:00.000Z",
      updated_at: null,
      upvotes: 0,
      parent_id: "c1",
      author_id: "author-2",
      profiles: { username: "kofi", full_name: "Kofi M", avatar_url: null },
    }));

    renderThread({
      initialComments: [comment({ replies, replyCount: replies.length })],
    });

    expect(screen.getByText("Reply number 2.")).toBeInTheDocument();
    expect(screen.queryByText("Reply number 4.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more replies" }));

    expect(screen.getByText("Reply number 4.")).toBeInTheDocument();
  });

  it("gives every comment a permalink", () => {
    renderThread();

    const permalink = screen.getByRole("link", { name: /ago|edited|now/i });
    expect(permalink.getAttribute("href")).toBe("#comment-c1");
  });
});
