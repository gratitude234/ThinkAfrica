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

// promoteToArticle delegates Article-draft creation to ensureDraft (auth,
// suspension, topic rules, sanitization, Phase 4A dual-write). These tests
// are about the Post-to-Article conversion itself, so they assert on the
// payload handed over rather than re-testing ensureDraft.
const ensureDraftMock = vi.hoisted(() => vi.fn(async () => ({ error: null, draftId: "draft-1" })));
vi.mock("@/app/(write)/write/actions", () => ({
  ensureDraft: ensureDraftMock,
}));

import { createPost, promoteToArticle } from "./actions";

function baseInput(overrides: Partial<Parameters<typeof createPost>[0]> = {}) {
  return {
    body: "A perfectly normal quick thought.",
    imageUrl: null,
    inResponseTo: null,
    topics: [],
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
    expect(insertedWith.tags).toEqual([]);
  });

  it("normalizes and stores up to three optional topics", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: { id: "new-post-id" }, error: null }),
    });

    const result = await createPost(
      baseInput({ topics: [" Technology ", "technology", "Education Policy"] })
    );

    expect(result.error).toBeNull();
    expect(
      fakeSupabase.current!.builders.posts[0].insertedWith
    ).toEqual(
      expect.objectContaining({
        tags: ["technology", "education policy"],
      })
    );
  });

  it("rejects more than three Short Post topics server-side", async () => {
    fakeSupabase.current = makeFakeSupabase({});

    const result = await createPost(
      baseInput({ topics: ["one", "two", "three", "four"] })
    );

    expect(result.error).toMatch(/at most 3 topics/i);
    expect(result.slug).toBeNull();
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

describe("promoteToArticle", () => {
  beforeEach(() => {
    fakeSupabase.current = makeFakeSupabase({});
    ensureDraftMock.mockClear();
    ensureDraftMock.mockResolvedValue({ error: null, draftId: "draft-1" });
  });

  it("carries the body over as sanitized Article HTML instead of dropping it", async () => {
    const result = await promoteToArticle({
      body: "Buses run late every morning. Nobody publishes a schedule.",
      imageUrl: null,
      topics: ["Campus transport"],
    });

    expect(result).toEqual({ error: null, draftId: "draft-1" });
    const payload = ensureDraftMock.mock.calls[0][0];
    expect(payload.content).toContain("Buses run late every morning.");
    expect(payload.content).toContain("Nobody publishes a schedule.");
    expect(payload.tags).toEqual(["Campus transport"]);
    expect(payload.draftId).toBeNull();
  });

  it("gives the Article the writer's own opening line as a working title", async () => {
    await promoteToArticle({
      body: "Buses run late every morning. Nobody publishes a schedule.",
      imageUrl: null,
      topics: [],
    });

    // An Article row cannot be titleless (posts_title_required_unless_post_check),
    // and the title must not be an invented placeholder.
    expect(ensureDraftMock.mock.calls[0][0].title).toBe("Buses run late every morning");
  });

  it("shortens a long opening sentence on a word boundary", async () => {
    await promoteToArticle({
      body: "The university keeps publishing transport timetables that nobody on campus has ever been able to rely on in practice",
      imageUrl: null,
      topics: [],
    });

    const title = ensureDraftMock.mock.calls[0][0].title;
    expect(title.length).toBeLessThanOrEqual(84);
    expect(title.endsWith("...")).toBe(true);
    expect(title).toContain("The university keeps publishing");
  });

  it("leaves the feed summary for the writer rather than deriving one", async () => {
    await promoteToArticle({
      body: "Buses run late every morning.",
      imageUrl: null,
      topics: [],
    });

    expect(ensureDraftMock.mock.calls[0][0].excerpt).toBe("");
  });

  it("preserves a verified response parent in the promoted Article draft", async () => {
    await promoteToArticle({
      body: "This counter-argument needs more room.",
      imageUrl: null,
      topics: [],
      inResponseTo: "parent-1",
    });

    expect(ensureDraftMock.mock.calls[0][0].inResponseTo).toBe("parent-1");
  });

  it("drops a cover image that is not this user's own upload", async () => {
    await promoteToArticle({
      body: "Buses run late every morning.",
      imageUrl: "https://evil.example.com/tracker.png",
      topics: [],
    });

    expect(ensureDraftMock.mock.calls[0][0].coverImageUrl).toBe("");
  });

  it("refuses an empty body without creating anything", async () => {
    const result = await promoteToArticle({ body: "   ", imageUrl: null, topics: [] });

    expect(result.draftId).toBeNull();
    expect(result.error).toBe("Write something first.");
    expect(ensureDraftMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    fakeSupabase.current = makeFakeSupabase({}, null);

    const result = await promoteToArticle({ body: "Anything.", imageUrl: null, topics: [] });

    expect(result.error).toBe("You must be signed in.");
    expect(ensureDraftMock).not.toHaveBeenCalled();
  });
});
