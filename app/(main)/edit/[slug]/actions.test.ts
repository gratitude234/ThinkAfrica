import { describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

const fakeSupabase = { current: null as ReturnType<typeof makeFakeSupabase> | null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => makeFakeSupabase({})),
}));

vi.mock("@/lib/reviewWorkflow", () => ({
  requiresEditorialWorkflow: (type: string | null | undefined) =>
    type === "research" || type === "policy_brief",
  createVersionSnapshot: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { saveEditedPost } from "./actions";

function baseInput(overrides: Partial<Parameters<typeof saveEditedPost>[0]> = {}) {
  return {
    postId: "post-1",
    title: "An edited title",
    excerpt: "",
    content: "<p>Edited</p>",
    tags: [],
    coverImageUrl: "",
    authorNote: "",
    references: [],
    ...overrides,
  };
}

function withPostReferencesRoute(routes: Record<string, () => ReturnType<typeof queueResults>>) {
  return { post_references: queueResults({ data: [], error: null }), ...routes };
}

describe("saveEditedPost", () => {
  it("preserves a legacy Essay's article_format after editing, with no client-supplied classification", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        {
          data: {
            author_id: "user-1",
            slug: "an-essay",
            type: "essay",
            content_kind: "article",
            article_format: "essay",
            status: "published",
            current_round: 1,
          },
          error: null,
        },
        { error: null }
      ),
      ...withPostReferencesRoute({}),
    });

    const result = await saveEditedPost(baseInput());

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.type).toBe("essay");
    expect(updatedWith.content_kind).toBe("article");
    expect(updatedWith.article_format).toBe("essay");
  });

  it("does not turn a generic Article into a legacy Essay merely by editing it", async () => {
    // type="essay" is the dual-write legacy value for a brand-new generic
    // Article (see legacyTypeForNewContent) -- content_kind/article_format
    // are what actually distinguish it from a real legacy Essay, and must
    // survive an edit unchanged.
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        {
          data: {
            author_id: "user-1",
            slug: "a-generic-article",
            type: "essay",
            content_kind: "article",
            article_format: null,
            status: "published",
            current_round: 1,
          },
          error: null,
        },
        { error: null }
      ),
      ...withPostReferencesRoute({}),
    });

    const result = await saveEditedPost(baseInput({ title: "An edited generic article" }));

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.type).toBe("essay");
    expect(updatedWith.content_kind).toBe("article");
    expect(updatedWith.article_format).toBeNull();
  });

  it("preserves a legacy Policy Brief's article_format and pending_revision workflow state after editing", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        {
          data: {
            author_id: "user-1",
            slug: "a-policy-brief",
            type: "policy_brief",
            content_kind: "article",
            article_format: "policy_brief",
            status: "pending_revision",
            current_round: 1,
          },
          error: null,
        },
        { error: null }
      ),
      ...withPostReferencesRoute({}),
    });

    const result = await saveEditedPost(
      baseInput({
        authorNote: "Addressed the reviewer's requested changes.",
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
            ref_type: "other",
          },
        ],
      })
    );

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.type).toBe("policy_brief");
    expect(updatedWith.article_format).toBe("policy_brief");
    // pending_revision resubmits into the review queue, not straight to published
    expect(updatedWith.status).toBe("pending");
    expect(updatedWith.current_round).toBe(2);
  });

  it("requires an author note before resubmitting a pending_revision policy brief", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: {
          author_id: "user-1",
          slug: "a-policy-brief",
          type: "policy_brief",
          content_kind: "article",
          article_format: "policy_brief",
          status: "pending_revision",
          current_round: 1,
        },
        error: null,
      }),
    });

    const result = await saveEditedPost(
      baseInput({
        authorNote: "   ",
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
            ref_type: "other",
          },
        ],
      })
    );

    expect(result.error).toMatch(/author response note/i);
    // Refused before any write -- only the initial select happened.
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it("derives the workflow transition from the stored status, ignoring any client-supplied currentStatus/currentRound smuggled into the request", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        {
          data: {
            author_id: "user-1",
            slug: "a-policy-brief",
            type: "policy_brief",
            content_kind: "article",
            article_format: "policy_brief",
            status: "pending_revision",
            current_round: 1,
          },
          error: null,
        },
        { error: null }
      ),
      ...withPostReferencesRoute({}),
    });

    // Simulates a modified/forged request: the function's own TypeScript
    // signature no longer even has these fields, but a raw request body
    // could still include them. They must have zero effect.
    const spoofedInput = {
      ...baseInput({
        authorNote: "Addressed the reviewer's requested changes.",
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
            ref_type: "other",
          },
        ],
      }),
      currentStatus: "published",
      currentRound: 999,
    } as unknown as Parameters<typeof saveEditedPost>[0];

    const result = await saveEditedPost(spoofedInput);

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    // Derived from the DB's real pending_revision state, not the spoofed "published"/999.
    expect(updatedWith.status).toBe("pending");
    expect(updatedWith.current_round).toBe(2);
  });

  it("refuses to revise a research post through this action", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: {
          author_id: "user-1",
          slug: "a-paper",
          type: "research",
          status: "published",
          current_round: 1,
        },
        error: null,
      }),
    });

    const result = await saveEditedPost(baseInput());

    expect(result.error).toMatch(/research submission flow/i);
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it("locks a published policy brief from further edits (citation record stability)", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: {
          author_id: "user-1",
          slug: "a-policy-brief",
          type: "policy_brief",
          status: "published",
          current_round: 1,
        },
        error: null,
      }),
    });

    const result = await saveEditedPost(baseInput());

    expect(result.error).toMatch(/locked after acceptance/i);
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it("does not let a legacy titled Blog be reclassified merely by editing it", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        {
          data: {
            author_id: "user-1",
            slug: "a-blog-post",
            type: "blog",
            status: "published",
            current_round: 1,
          },
          error: null,
        },
        { error: null }
      ),
      ...withPostReferencesRoute({}),
    });

    const result = await saveEditedPost(baseInput({ title: "Still has a title" }));

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.type).toBe("blog");
    expect(updatedWith.content_kind).toBe("post");
    expect(updatedWith.article_format).toBeNull();
  });

  it("refuses to edit a post owned by a different user", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: {
          author_id: "someone-else",
          slug: "not-yours",
          type: "essay",
          status: "published",
          current_round: 1,
        },
        error: null,
      }),
    });

    const result = await saveEditedPost(baseInput());

    expect(result.error).toMatch(/permission/i);
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });
});
