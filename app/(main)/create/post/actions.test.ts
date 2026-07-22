import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

const { fakeSupabase } = vi.hoisted(() => {
  return { fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null } };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeSupabase.current),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => makeFakeSupabase({})),
}));

vi.mock("@/lib/suspension", () => ({
  requireNotSuspended: vi.fn(async () => null),
}));

vi.mock("@/lib/email", () => ({
  sendUserEmail: vi.fn(async () => ({ ok: true })),
  logEmailResult: vi.fn(),
}));

vi.mock("@/lib/activationServer", () => ({
  recordActivationEvent: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createPost } from "./actions";

function baseInput(overrides: Partial<Parameters<typeof createPost>[0]> = {}) {
  return {
    body: "A perfectly normal quick thought.",
    imageUrl: null,
    inResponseTo: null,
    ...overrides,
  };
}

/** Standard supporting mocks needed once a response notification fires (profiles lookup for the responder's name). */
function withResponderProfile(postsResults: Parameters<typeof queueResults>) {
  return {
    posts: queueResults(...postsResults),
    profiles: queueResults({ data: { full_name: "A Responder" }, error: null }),
  };
}

describe("createPost", () => {
  beforeEach(() => {
    fakeSupabase.current = null;
  });

  it("publishes a titleless lightweight Post as before when there is no response context", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: { id: "new-post-id" }, error: null }),
    });

    const result = await createPost(baseInput());

    expect(result.error).toBeNull();
    expect(result.slug).not.toBeNull();
    const insertedWith = fakeSupabase.current!.builders.posts[0].insertedWith as Record<
      string,
      unknown
    >;
    expect(insertedWith.title).toBeNull();
    expect(insertedWith.type).toBe("blog");
    expect(insertedWith.content_kind).toBe("post");
    expect(insertedWith.in_response_to).toBeNull();
  });

  it("rejects an empty body server-side even if the client's own character count somehow let it through", async () => {
    fakeSupabase.current = makeFakeSupabase({});

    const result = await createPost(baseInput({ body: "   " }));

    expect(result.error).toMatch(/write something/i);
    expect(result.slug).toBeNull();
  });

  describe("response parent validation (Pass 3: Response Creation UX)", () => {
    it("rejects a claimed parent that doesn't exist or isn't published", async () => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: null, error: null }),
      });

      const result = await createPost(baseInput({ inResponseTo: "missing-parent" }));

      expect(result).toEqual({
        error: "That post is no longer available to respond to.",
        slug: null,
      });
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });

    it("stores the server-validated parent id -- never trusting a client-supplied title/author/kind/status", async () => {
      fakeSupabase.current = makeFakeSupabase(
        withResponderProfile([
          {
            data: {
              id: "parent-1",
              author_id: "parent-author",
              slug: "parent-slug",
              title: "The real parent title",
            },
            error: null,
          },
          { data: { id: "response-id" }, error: null },
        ])
      );

      const result = await createPost(baseInput({ inResponseTo: "parent-1" }));

      expect(result.error).toBeNull();
      const insertedWith = fakeSupabase.current!.builders.posts[1].insertedWith as Record<
        string,
        unknown
      >;
      expect(insertedWith.in_response_to).toBe("parent-1");
      // The stored kind/title contract for a Quick response is unaffected
      // by which post it responds to.
      expect(insertedWith.title).toBeNull();
      expect(insertedWith.content_kind).toBe("post");
    });

    it("a Quick response to a titleless parent Post still publishes correctly", async () => {
      fakeSupabase.current = makeFakeSupabase(
        withResponderProfile([
          {
            data: {
              id: "parent-post-id",
              author_id: "parent-author",
              slug: "parent-post-slug",
              title: null,
            },
            error: null,
          },
          { data: { id: "response-id" }, error: null },
        ])
      );

      const result = await createPost(baseInput({ inResponseTo: "parent-post-id" }));

      expect(result.error).toBeNull();
      const insertedWith = fakeSupabase.current!.builders.posts[1].insertedWith as Record<
        string,
        unknown
      >;
      expect(insertedWith.in_response_to).toBe("parent-post-id");
    });

    it("does not require a parent lookup at all when inResponseTo is absent", async () => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: { id: "new-post-id" }, error: null }),
      });

      const result = await createPost(baseInput({ inResponseTo: null }));

      expect(result.error).toBeNull();
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });
  });
});
