import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const deleted: { ids: string[][] } = { ids: [] };

function mockSupabaseWithDrafts(drafts: Array<Record<string, unknown>>, deleteError: unknown = null) {
  deleted.ids = [];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: drafts }),
              }),
            }),
          }),
        }),
        delete: () => ({
          in: (_column: string, ids: string[]) => {
            deleted.ids.push(ids);
            return Promise.resolve({ error: deleteError });
          },
        }),
      }),
    }),
  }));
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    title: "A generic article draft",
    excerpt: null,
    word_count: 400,
    type: "essay",
    content_kind: "article",
    article_format: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function openPanel(drafts: Array<Record<string, unknown>>, deleteError: unknown = null) {
  vi.resetModules();
  mockSupabaseWithDrafts(drafts, deleteError);
  const { default: MyDraftsFresh } = await import("./MyDrafts");
  render(<MyDraftsFresh activeDraftId={null} />);
  await userEvent.click(await screen.findByText("My Drafts"));
  return MyDraftsFresh;
}

describe("MyDrafts", () => {
  it("lists a draft without exposing a format label", async () => {
    await openPanel([draft()]);

    await waitFor(() => {
      expect(screen.getByText("A generic article draft")).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Essay ·/)).not.toBeInTheDocument();
  });

  it("keeps legacy drafts resumable with neutral copy", async () => {
    await openPanel([draft({ id: "draft-2", title: "A legacy essay draft", article_format: "essay" })]);

    await waitFor(() => {
      expect(screen.getByText("A legacy essay draft")).toBeInTheDocument();
    });
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("names an untitled draft by its own opening words", async () => {
    await openPanel([draft({ title: null, excerpt: "The state of solar microgrids in Jos" })]);

    await waitFor(() => {
      expect(screen.getByText("The state of solar microgrids in Jos")).toBeInTheDocument();
    });
    // Three identical "Untitled draft" rows are what made the list unreadable.
    expect(screen.queryByText("Untitled draft")).not.toBeInTheDocument();
  });

  it("shows length so a scrap reads differently from real work", async () => {
    await openPanel([
      draft({ id: "big", title: "Real work", word_count: 1240 }),
      draft({ id: "small", title: "A scrap", word_count: 2 }),
    ]);

    await waitFor(() => {
      expect(screen.getByText(/1,240 words ·/)).toBeInTheDocument();
    });
    expect(screen.getByText(/2 words ·/)).toBeInTheDocument();
  });

  it("deletes a single draft from the list", async () => {
    await openPanel([draft({ id: "draft-9", title: "Throwaway" })]);
    await waitFor(() => expect(screen.getByText("Throwaway")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Delete draft: Throwaway" }));

    await waitFor(() => expect(deleted.ids).toEqual([["draft-9"]]));
    expect(screen.queryByText("Throwaway")).not.toBeInTheDocument();
  });

  it("offers a sweep for old untitled scraps, and only after a confirmation", async () => {
    await openPanel([
      draft({ id: "a", title: null, word_count: 1, updated_at: daysAgo(20) }),
      draft({ id: "b", title: null, word_count: 3, updated_at: daysAgo(30) }),
      draft({ id: "keep", title: "Real work", word_count: 900, updated_at: daysAgo(40) }),
    ]);

    await waitFor(() => {
      expect(screen.getByText("2 empty drafts you never came back to.")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Clear them" }));
    // Nothing is destroyed on the first tap.
    expect(deleted.ids).toEqual([]);
    expect(screen.getByText("Delete 2 permanently?")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleted.ids).toEqual([["a", "b"]]));
    expect(screen.getByText("Real work")).toBeInTheDocument();
  });

  it("leaves titled or recent drafts out of the sweep entirely", async () => {
    await openPanel([
      draft({ id: "titled", title: "Named but tiny", word_count: 1, updated_at: daysAgo(60) }),
      draft({ id: "recent", title: null, word_count: 1, updated_at: new Date().toISOString() }),
      draft({ id: "long", title: null, word_count: 800, updated_at: daysAgo(60) }),
    ]);

    await waitFor(() => expect(screen.getByText("Named but tiny")).toBeInTheDocument());
    expect(screen.queryByText(/never came back to/)).not.toBeInTheDocument();
  });

  it("caps the list and defers the rest behind one control", async () => {
    await openPanel(
      Array.from({ length: 9 }, (_unused, index) =>
        draft({ id: `d${index}`, title: `Draft number ${index}`, word_count: 100 })
      )
    );

    await waitFor(() => expect(screen.getByText("Draft number 0")).toBeInTheDocument());
    expect(screen.queryByText("Draft number 8")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show 4 more" }));
    expect(screen.getByText("Draft number 8")).toBeInTheDocument();
  });

  it("keeps the row when the database refuses the delete", async () => {
    await openPanel([draft({ id: "locked", title: "Submitted elsewhere" })], {
      message: "This post is no longer an editable draft.",
    });
    await waitFor(() => expect(screen.getByText("Submitted elsewhere")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Delete draft: Submitted elsewhere" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("no longer an editable draft");
    });
    expect(screen.getByText("Submitted elsewhere")).toBeInTheDocument();
  });
});
