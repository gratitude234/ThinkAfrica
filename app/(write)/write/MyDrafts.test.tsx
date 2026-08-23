import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

function mockSupabaseWithDrafts(drafts: Array<Record<string, unknown>>) {
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
      }),
    }),
  }));
}

describe("MyDrafts", () => {
  it("lists a draft without exposing a format label", async () => {
    vi.resetModules();
    mockSupabaseWithDrafts([
      {
        id: "draft-1",
        title: "A generic article draft",
        type: "essay",
        content_kind: "article",
        article_format: null,
        updated_at: new Date().toISOString(),
      },
    ]);
    const { default: MyDraftsFresh } = await import("./MyDrafts");

    render(<MyDraftsFresh activeDraftId={null} />);

    await userEvent.click(await screen.findByText("My Drafts"));

    await waitFor(() => {
      expect(screen.getByText(/^Saved /)).toBeInTheDocument();
    });
    expect(screen.queryByText(/^Essay ·/)).not.toBeInTheDocument();
  });

  it("keeps legacy drafts resumable with neutral copy", async () => {
    vi.resetModules();
    mockSupabaseWithDrafts([
      {
        id: "draft-2",
        title: "A legacy essay draft",
        type: "essay",
        content_kind: "article",
        article_format: "essay",
        updated_at: new Date().toISOString(),
      },
    ]);
    const { default: MyDraftsFresh } = await import("./MyDrafts");

    render(<MyDraftsFresh activeDraftId={null} />);

    await userEvent.click(await screen.findByText("My Drafts"));

    await waitFor(() => {
      expect(screen.getByText(/^Saved /)).toBeInTheDocument();
    });
  });
});
