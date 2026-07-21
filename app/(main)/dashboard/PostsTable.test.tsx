import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PostsTable, { type DashboardPost } from "./PostsTable";

vi.mock("@/lib/realtime", () => ({
  shouldUseRealtime: () => false,
}));

const deleteResult = { current: { error: null as { message: string } | null } };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({
        eq: () => Promise.resolve(deleteResult.current),
      }),
    }),
  }),
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
  it("keeps the row visible and shows an error toast when the database rejects the delete", async () => {
    deleteResult.current = { error: { message: "This post is no longer an editable draft." } };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.getByText("This post is no longer an editable draft.")).toBeInTheDocument();
    });
    // The row itself is unaffected by a rejected delete -- it stays visible.
    expect(screen.getByText("My draft")).toBeInTheDocument();
  });

  it("removes the row and shows no toast when the delete succeeds", async () => {
    deleteResult.current = { error: null };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("My draft")).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/no longer an editable draft/i)).not.toBeInTheDocument();
  });

  it("does nothing when the confirm dialog is dismissed", async () => {
    deleteResult.current = { error: null };
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText("My draft")).toBeInTheDocument();
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
