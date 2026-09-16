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

function draftPost(overrides: Partial<DashboardPost> = {}): DashboardPost {
  return {
    id: "post-1",
    author_id: "user-1",
    title: "My draft",
    slug: "my-draft",
    content_kind: "article",
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
    content_kind: "article",
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

  it("offers neither Delete nor Withdraw for a legacy pending submission", () => {
    render(<PostsTable posts={[pendingSubmission()]} userId="user-1" />);

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
  });
});

describe("PostsTable legacy review workflow", () => {
  it("offers only drafts and published work as filters", () => {
    render(<PostsTable posts={[draftPost()]} userId="user-1" />);

    for (const name of ["pending", "pending revision", "rejected", "withdrawn"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "published" })).toBeInTheDocument();
  });

  it("opens a formerly locked publication for editing, like any other", () => {
    // It used to offer View, because guard_locked_post_write refused a write
    // to a publication that had been through review. 20260915000007 retired
    // that lock, so the author edits their own work.
    render(
      <PostsTable
        posts={[
          draftPost({
            id: "post-3",
            title: "An accepted brief",
            slug: "an-accepted-brief",
            content_kind: "article",
            status: "published",
            published_at: "2026-07-18T00:00:00.000Z",
          }),
        ]}
        userId="user-1"
      />
    );

    expect(screen.queryByRole("link", { name: "View" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/edit/an-accepted-brief"
    );
  });

  it("labels each row with its kind, and never a genre", () => {
    render(
      <PostsTable
        posts={[
          draftPost({ content_kind: "article" }),
          draftPost({ id: "post-4", slug: "a-post", content_kind: "post" }),
        ]}
        userId="user-1"
      />
    );

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Post")).toBeInTheDocument();
    for (const gone of ["Essay", "Policy Brief", "Research", "Blog"]) {
      expect(screen.queryByText(gone), gone).not.toBeInTheDocument();
    }
  });
});
