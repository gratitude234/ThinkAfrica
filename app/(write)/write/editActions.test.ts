import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";
import type { ContributionSnapshot } from "@/lib/contribution";
import type { PostReferenceRecord } from "@/lib/types";

const { fakeSupabase } = vi.hoisted(() => ({
  fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyPublishedEditDraft, savePublishedEditDraft } from "./editActions";

const STORED_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function snapshot(overrides: Partial<ContributionSnapshot> = {}): ContributionSnapshot {
  return {
    title: "A living publication",
    content: "<p>The body.</p>",
    excerpt: "",
    tags: [],
    coverImageUrl: "",
    references: [],
    collaborators: [],
    inResponseToId: null,
    promptId: null,
    ...overrides,
  };
}

function reference(overrides: Partial<PostReferenceRecord> = {}) {
  return {
    id: STORED_ID,
    post_id: "post-1",
    display_order: 0,
    ref_type: "journal",
    authors: "Ada L.",
    title: "A study",
    year: 2024,
    source: "A journal",
    url: null,
    doi: null,
    raw: null,
    ...overrides,
  } as PostReferenceRecord;
}

function editablePost() {
  return {
    id: "post-1",
    slug: "a-living-publication-abc",
    author_id: "user-1",
    status: "published",
    type: "essay",
    content_kind: "article",
    citation_id: null,
    published_version_id: null,
  };
}

describe("savePublishedEditDraft", () => {
  beforeEach(() => {
    fakeSupabase.current = null;
  });

  it("carries each stored source's row id into the snapshot", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: editablePost(), error: null }),
      post_edit_drafts: queueResults({ data: { id: "edit-1" }, error: null }),
    });

    const result = await savePublishedEditDraft({
      postId: "post-1",
      snapshot: snapshot({ references: [reference()] }),
    });

    expect(result.error).toBeNull();
    const payload = fakeSupabase.current.builders.post_edit_drafts[0].upsertedWith as {
      reference_snapshot: Array<{ id: string | null }>;
    };
    // Inline citations anchor to this id, so it has to survive the round trip.
    expect(payload.reference_snapshot[0].id).toBe(STORED_ID);
  });

  it("stores a brand-new source without inventing an id for it", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: editablePost(), error: null }),
      post_edit_drafts: queueResults({ data: { id: "edit-1" }, error: null }),
    });

    await savePublishedEditDraft({
      postId: "post-1",
      snapshot: snapshot({ references: [reference({ id: "temp-fresh" })] }),
    });

    const payload = fakeSupabase.current!.builders.post_edit_drafts[0].upsertedWith as {
      reference_snapshot: Array<{ id: string | null }>;
    };
    expect(payload.reference_snapshot[0].id).toBeNull();
  });
});

describe("applyPublishedEditDraft", () => {
  beforeEach(() => {
    fakeSupabase.current = null;
  });

  it("refuses an edit that leaves a citation pointing at a removed source", async () => {
    fakeSupabase.current = makeFakeSupabase({
      post_edit_drafts: queueResults({
        data: {
          content: `<p>A claim <a href="#ref-id-${STORED_ID}">[source]</a></p>`,
          reference_snapshot: [],
        },
        error: null,
      }),
    });

    const result = await applyPublishedEditDraft({ editDraftId: "edit-1" });

    expect(result.error).toMatch(/source that was removed/i);
    expect(result.slug).toBeNull();
    // The live publication is never touched when the edit cannot stand.
    expect(fakeSupabase.current.rpcCalls).toHaveLength(0);
  });

  it("applies an edit whose citations still resolve", async () => {
    fakeSupabase.current = makeFakeSupabase(
      {
        post_edit_drafts: queueResults({
          data: {
            content: `<p>A claim <a href="#ref-id-${STORED_ID}">[source]</a></p>`,
            reference_snapshot: [{ id: STORED_ID, title: "A study" }],
          },
          error: null,
        }),
      },
      "user-1",
      { apply_post_edit_draft: () => ({ data: "a-living-publication-abc", error: null }) }
    );

    const result = await applyPublishedEditDraft({ editDraftId: "edit-1" });

    expect(result.error).toBeNull();
    expect(result.slug).toBe("a-living-publication-abc");
    expect(fakeSupabase.current.rpcCalls[0]).toEqual({
      fn: "apply_post_edit_draft",
      params: { target_draft_id: "edit-1" },
    });
  });

  it("treats a citation to a source that moved posts as an orphan", async () => {
    fakeSupabase.current = makeFakeSupabase({
      post_edit_drafts: queueResults({
        data: {
          content: `<p>A claim <a href="#ref-id-${STORED_ID}">[source]</a></p>`,
          reference_snapshot: [{ id: OTHER_ID, title: "A different study" }],
        },
        error: null,
      }),
    });

    const result = await applyPublishedEditDraft({ editDraftId: "edit-1" });

    expect(result.error).toMatch(/source that was removed/i);
  });
});
