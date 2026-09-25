import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";
import type { ContributionSnapshot } from "@/lib/contribution";

const { fakeSupabase } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));
vi.mock("@/app/(write)/write/UniversalComposer", () => ({ default: () => null }));

import EditPage from "./page";

function published(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    title: null,
    slug: "hello",
    excerpt: "The opening line of the post.",
    content: "<p>The opening line of the post. And more.</p>",
    content_kind: "post",
    status: "published",
    tags: [],
    cover_image_url: null,
    author_id: "user-1",
    ...overrides,
  };
}

async function openedSnapshot(
  post: Record<string, unknown>,
  editDraft: Record<string, unknown> | null = null
) {
  fakeSupabase.current = makeFakeSupabase({
    posts: queueResults({ data: post, error: null }),
    post_references: queueResults({ data: [], error: null }),
    post_edit_drafts: queueResults({ data: editDraft, error: null }),
    profiles: queueResults({
      data: { full_name: "Ada", username: "ada", university: null, avatar_url: null },
      error: null,
    }),
  });
  const element = (await EditPage({ params: Promise.resolve({ slug: "hello" }) })) as ReactElement<{
    initialSnapshot: ContributionSnapshot;
  }>;
  return element.props.initialSnapshot;
}

describe("editing a published piece", () => {
  beforeEach(() => {
    fakeSupabase.current = null;
  });

  it("starts from no summary when the saved one was generated", async () => {
    expect((await openedSnapshot(published())).excerpt).toBe("");
  });

  it("keeps a summary someone wrote", async () => {
    const snapshot = await openedSnapshot(published({ excerpt: "Why this matters" }));

    expect(snapshot.excerpt).toBe("Why this matters");
  });

  it("judges an edit draft's summary against the edit draft's body", async () => {
    const snapshot = await openedSnapshot(published({ excerpt: "Why this matters" }), {
      id: "edit-1",
      title: null,
      excerpt: "The rewritten opening.",
      content: "<p>The rewritten opening. Then more.</p>",
      tags: [],
      cover_image_url: null,
      reference_snapshot: null,
      updated_at: "2026-09-25T10:00:00.000Z",
    });

    expect(snapshot.excerpt).toBe("");
    expect(snapshot.content).toBe("<p>The rewritten opening. Then more.</p>");
  });
});
