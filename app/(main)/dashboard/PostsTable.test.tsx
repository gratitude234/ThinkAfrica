import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PostsTable, { type DashboardPost } from "./PostsTable";

vi.mock("@/lib/realtime", () => ({
  shouldUseRealtime: () => false,
}));

/** What the server action answers, and the ids it was asked about. The table
 *  no longer issues a delete of its own: ownership and status are decided in
 *  app/(write)/write/deleteActions.ts. */
const deleteResult = {
  current: { ok: true, data: { deleted: ["post-1"], refusedCount: 0 } } as
    | { ok: true; data: { deleted: string[]; refusedCount: number } }
    | { ok: false; error: string },
};
const deleteCalls: string[][] = [];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  }),
}));

vi.mock("@/app/(write)/write/deleteActions", () => ({
  deleteOwnDraftPosts: async ({ postIds }: { postIds: string[] }) => {
    deleteCalls.push(postIds);
    return deleteResult.current;
  },
}));

const withdrawSubmissionMock = vi.fn();
vi.mock("@/app/(write)/write/actions", () => ({
  withdrawSubmission: (...args: unknown[]) => withdrawSubmissionMock(...args),
}));

function draftPost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: "post-1",
    author_id: "user-1",
    title: "My draft",
    slug: "my-draft",
    type: "essay",
    status: "draft",
    impression_count: 0,
    view_count: 0,
    read_count: 0,
    like_count: 0,
    created_at: "2026-07-17T00:00:00.000Z",
    published_at: null,
    ...overrides,
  };
}

function pendingSubmission(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return draftPost({
    id: "post-2",
    title: "My policy brief",
    slug: "my-policy-brief",
    type: "policy_brief",
    status: "pending",
    ...overrides,
  });
}

describe("PostsTable delete", () => {
  it("keeps the row visible and shows an error toast when the server refuses the delete", async () => {
    deleteResult.current = {
      ok: false,
      error: "Only drafts can be deleted. Withdraw a submission instead of deleting it.",
    };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText(/Only drafts can be deleted/)).toBeInTheDocument();
    });
    // The row itself is unaffected by a rejected delete -- it stays visible.
    expect(screen.getByText("My draft")).toBeInTheDocument();
  });

  it("removes the row and shows no toast when the delete succeeds", async () => {
    deleteCalls.length = 0;
    deleteResult.current = { ok: true, data: { deleted: ["post-1"], refusedCount: 0 } };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("My draft")).not.toBeInTheDocument();
    });
    // The post id is all that is sent. An author id is not the client's to
    // supply, and the action does not accept one.
    expect(deleteCalls).toEqual([["post-1"]]);
    expect(screen.queryByText(/Only drafts can be deleted/i)).not.toBeInTheDocument();
  });

  it("removes only the rows the server reports as deleted", async () => {
    // A draft submitted for review in another tab is refused server-side. The
    // list follows what actually went, not what was asked for, so the row
    // stays on screen rather than disappearing from a table that still has it.
    deleteResult.current = { ok: true, data: { deleted: [], refusedCount: 1 } };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByText("My draft")).toBeInTheDocument());
  });

  it("does nothing when the confirm dialog is dismissed", async () => {
    deleteCalls.length = 0;
    deleteResult.current = { ok: true, data: { deleted: [], refusedCount: 0 } };
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("My draft")).toBeInTheDocument();
    expect(deleteCalls).toEqual([]);
  });

  it("never offers Delete for a pending/pending_revision submission -- only Withdraw", () => {
    render(<PostsTable posts={[pendingSubmission()]} userId="user-1" />);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeInTheDocument();
  });
});

describe("PostsTable withdraw", () => {
  it("marks the row withdrawn (not removed) and shows no toast when withdrawal succeeds", async () => {
    withdrawSubmissionMock.mockResolvedValue({ error: null });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[pendingSubmission()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => {
      // Status badge specifically -- the tab filter bar also has a
      // "withdrawn" button, so a bare text match would be ambiguous.
      expect(screen.getByText("withdrawn", { selector: "span" })).toBeInTheDocument();
    });
    // The row survives withdrawal, unlike a delete.
    expect(screen.getByText("My policy brief")).toBeInTheDocument();
    expect(withdrawSubmissionMock).toHaveBeenCalledWith({ postId: "post-2" });
  });

  it("keeps the row pending and shows an error toast when withdrawal is rejected", async () => {
    withdrawSubmissionMock.mockResolvedValue({
      error: "Only a submission awaiting or in revision can be withdrawn.",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[pendingSubmission()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => {
      expect(
        screen.getByText("Only a submission awaiting or in revision can be withdrawn.")
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("withdrawn", { selector: "span" })).not.toBeInTheDocument();
    // Status label for a still-pending policy brief, unchanged by the rejection.
    expect(screen.getByText("Under review", { selector: "span" })).toBeInTheDocument();
  });

  it("does nothing when the confirm dialog is dismissed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<PostsTable posts={[pendingSubmission()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(withdrawSubmissionMock).not.toHaveBeenCalled();
  });
});
