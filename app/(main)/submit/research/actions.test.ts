import { describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

const fakeSupabase = { current: null as ReturnType<typeof makeFakeSupabase> | null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => makeFakeSupabase({ post_versions: queueResults({ data: null, error: null }) })),
}));

vi.mock("@/lib/activationServer", () => ({
  recordActivationEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/reviewWorkflow", () => ({
  createVersionSnapshot: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveResearchDraft, submitResearchPaper } from "./actions";

const document = { documentPath: "path/to.pdf", originalName: "paper.pdf", mimeType: "application/pdf", sizeBytes: 1024 };

function basePayload(overrides: Partial<Parameters<typeof submitResearchPaper>[0]> = {}) {
  return {
    draftId: "post-1",
    title: "A research title",
    abstract: "An abstract long enough to pass validation.",
    tags: ["policy"],
    document,
    references: [
      {
        id: "temp-1",
        display_order: 0,
        title: "A source",
        source: "Journal",
        authors: null,
        url: null,
        doi: null,
        raw: null,
        year: null,
        ref_type: "other" as const,
      },
    ],
    coAuthors: [],
    authorNote: "",
    ...overrides,
  };
}

function standardRoutes() {
  return {
    post_references: queueResults({ data: [], error: null }),
    post_authors: queueResults({ data: [], error: null }, { error: null }),
  };
}

describe("submitResearchPaper", () => {
  it("refuses to resubmit a withdrawn research paper", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "withdrawn", current_round: 1, type: "research" },
        error: null,
      }),
    });

    const result = await submitResearchPaper(basePayload());

    expect(result.error).toMatch(/can no longer be edited/i);
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it.each(["published", "pending", "rejected", "removed"])(
    "refuses to resubmit a research paper that isn't draft/pending_revision (status=%s)",
    async (status) => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({
          data: { id: "post-1", author_id: "user-1", slug: "a-paper", status, current_round: 1, type: "research" },
          error: null,
        }),
      });

      const result = await submitResearchPaper(basePayload());

      expect(result.error).toMatch(/can no longer be edited/i);
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    }
  );

  it("derives the author-note requirement from the stored status, not any client-supplied field -- resubmitting a revision without a note is rejected", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "pending_revision", current_round: 1, type: "research" },
        error: null,
      }),
    });

    const result = await submitResearchPaper(basePayload({ authorNote: "   " }));

    expect(result.error).toMatch(/author response note/i);
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it("resubmits a revision with an author note, advancing the round and snapshotting as a revision", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        {
          data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "pending_revision", current_round: 2, type: "research" },
          error: null,
        },
        { data: [{ id: "post-1" }], error: null }
      ),
      ...standardRoutes(),
    });

    const result = await submitResearchPaper(basePayload({ authorNote: "Addressed reviewer feedback." }));

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.status).toBe("pending");
    expect(updatedWith.current_round).toBe(3);
  });

  it("submits a brand-new draft for the first time as round 1", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "draft", current_round: 1, type: "research" }, error: null },
        { data: [{ id: "post-1" }], error: null }
      ),
      ...standardRoutes(),
    });

    const result = await submitResearchPaper(basePayload());

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.status).toBe("pending");
    expect(updatedWith.current_round).toBe(1);
  });

  it("does not silently succeed when the row's status changes between the read and the write (TOCTOU race)", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "draft", current_round: 1, type: "research" }, error: null },
        { data: [], error: null }
      ),
    });

    const result = await submitResearchPaper(basePayload());

    expect(result.error).toMatch(/can no longer be edited/i);
  });

  it("refuses to edit a research submission owned by a different user", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { id: "post-1", author_id: "someone-else", slug: "a-paper", status: "draft", current_round: 1, type: "research" },
        error: null,
      }),
    });

    const result = await submitResearchPaper(basePayload());

    expect(result.error).toMatch(/permission/i);
  });

  it("refuses to touch a post that isn't actually type=research", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { id: "post-1", author_id: "user-1", slug: "not-research", status: "draft", current_round: 1, type: "essay" },
        error: null,
      }),
    });

    const result = await submitResearchPaper(basePayload());

    expect(result.error).toMatch(/not a research paper/i);
  });
});

describe("saveResearchDraft", () => {
  it("refuses to autosave over a withdrawn research paper", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "withdrawn", current_round: 1, type: "research" },
        error: null,
      }),
    });

    const result = await saveResearchDraft(basePayload());

    expect(result.error).toMatch(/can no longer be edited/i);
  });

  it("refuses to autosave over an already-published (accepted) research paper", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "published", current_round: 1, type: "research" },
        error: null,
      }),
    });

    const result = await saveResearchDraft(basePayload());

    expect(result.error).toMatch(/can no longer be edited/i);
  });

  it("saves a draft in progress", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { id: "post-1", author_id: "user-1", slug: "a-paper", status: "draft", current_round: 1, type: "research" }, error: null },
        { data: [{ id: "post-1" }], error: null }
      ),
      ...standardRoutes(),
    });

    const result = await saveResearchDraft(basePayload({ document: { documentPath: null, originalName: null, mimeType: null, sizeBytes: null } }));

    expect(result.error).toBeNull();
  });
});
