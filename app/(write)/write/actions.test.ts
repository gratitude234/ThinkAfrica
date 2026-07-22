import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, makeBuilder, queueResults } from "@/lib/testUtils/supabaseMock";

const { fakeSupabase, createClientMock } = vi.hoisted(() => {
  return { fakeSupabase: { current: null as ReturnType<typeof makeFakeSupabase> | null }, createClientMock: vi.fn() };
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

vi.mock("@/lib/reviewWorkflow", () => ({
  requiresEditorialWorkflow: (type: string | null | undefined) =>
    type === "research" || type === "policy_brief",
  getSubmissionTrack: vi.fn(async () => ({
    post_type: "essay",
    requires_review: false,
    min_reviewers: 0,
    allow_revision: true,
    description: "",
  })),
  createVersionSnapshot: vi.fn(async () => {}),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { ensureDraft, publishPost, savePostReferences, withdrawSubmission } from "./actions";

function baseDraftInput(overrides: Partial<Parameters<typeof ensureDraft>[0]> = {}) {
  return {
    draftId: null,
    title: "A real title",
    excerpt: "",
    content: "<p>Hello</p>",
    tags: [],
    postType: "essay" as const,
    coverImageUrl: "",
    inResponseTo: null,
    ...overrides,
  };
}

function basePublishInput(overrides: Partial<Parameters<typeof publishPost>[0]> = {}) {
  return {
    draftId: null,
    title: "A real title",
    excerpt: "",
    content: "<p>Hello</p>",
    tags: [],
    postType: "essay" as const,
    coverImageUrl: "",
    references: [],
    ...overrides,
  };
}

/** Standard supporting mocks needed by publishPost's happy path, beyond the "posts" table. */
function standardPublishRoutes() {
  return {
    profiles: queueResults({ data: { full_name: "Test Author" }, error: null }),
    post_references: queueResults({ data: [], error: null }),
    post_authors: queueResults({ data: [], error: null }, { data: null, error: null }),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true }))
  );
});

describe("ensureDraft", () => {
  it("creates a brand-new draft as a generic Article, ignoring a spoofed postType", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: { id: "new-draft-id" }, error: null }),
    });

    const result = await ensureDraft(baseDraftInput({ postType: "policy_brief" }));

    expect(result).toEqual({ error: null, draftId: "new-draft-id" });
    const insertedWith = fakeSupabase.current!.builders.posts[0].insertedWith as Record<string, unknown>;
    expect(insertedWith.type).toBe("essay");
    expect(insertedWith.content_kind).toBe("article");
    expect(insertedWith.article_format).toBeNull();
  });

  it("refuses to touch an existing draft owned by a different user", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { type: "essay", status: "draft", author_id: "someone-else" },
        error: null,
      }),
    });

    const result = await ensureDraft(baseDraftInput({ draftId: "draft-1" }));

    expect(result).toEqual({
      error: "You do not have permission to edit this draft.",
      draftId: null,
    });
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it("refuses to edit a research draft through the Article draft action", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: { type: "research", status: "draft", author_id: "user-1" }, error: null }),
    });

    const result = await ensureDraft(baseDraftInput({ draftId: "draft-1" }));

    expect(result.error).toMatch(/research submission flow/i);
    expect(result.draftId).toBeNull();
  });

  it("preserves an existing policy_brief draft's classification even when the client sends a spoofed postType", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { type: "policy_brief", status: "draft", author_id: "user-1" }, error: null },
        { data: [{ id: "draft-1" }], error: null }
      ),
    });

    const result = await ensureDraft(baseDraftInput({ draftId: "draft-1", postType: "essay" }));

    expect(result).toEqual({ error: null, draftId: "draft-1" });
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.type).toBe("policy_brief");
    expect(updatedWith.content_kind).toBe("article");
    expect(updatedWith.article_format).toBe("policy_brief");
  });

  it.each(["published", "pending", "pending_revision", "removed"])(
    "refuses to touch an existing row that is no longer an editable draft (status=%s), even for a stale/forged draft id",
    async (status) => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: { type: "essay", status, author_id: "user-1" }, error: null }),
      });

      const result = await ensureDraft(baseDraftInput({ draftId: "already-published-id" }));

      expect(result.error).toMatch(/no longer an editable draft/i);
      expect(result.draftId).toBeNull();
      // Only the read happened -- no update was attempted against the row.
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    }
  );

  it("does not silently succeed when the row stops being a draft between the read and the write (TOCTOU race)", async () => {
    // The select-time check passes (status was "draft" a moment ago), but
    // the update's own `status = "draft"` filter is what's authoritative --
    // simulated here by the update matching zero rows, exactly what a
    // concurrent publishPost() landing in between would produce.
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { type: "essay", status: "draft", author_id: "user-1" }, error: null },
        { data: [], error: null }
      ),
    });

    const result = await ensureDraft(baseDraftInput({ draftId: "draft-1" }));

    expect(result.error).toMatch(/no longer an editable draft/i);
    expect(result.draftId).toBeNull();
  });

  describe("response parent validation (Pass 3: Response Creation UX)", () => {
    it("rejects a new draft whose claimed parent doesn't exist or isn't published, without inserting anything", async () => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: null, error: null }),
      });

      const result = await ensureDraft(
        baseDraftInput({ draftId: null, inResponseTo: "missing-parent" })
      );

      expect(result).toEqual({
        error: "That post is no longer available to respond to.",
        draftId: null,
      });
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });

    it("rejects an existing draft naming itself as its own parent, before touching the database at all", async () => {
      fakeSupabase.current = makeFakeSupabase({ posts: queueResults() });

      const result = await ensureDraft(
        baseDraftInput({ draftId: "draft-1", inResponseTo: "draft-1" })
      );

      expect(result).toEqual({
        error: "A post can't be a response to itself.",
        draftId: null,
      });
      expect(fakeSupabase.current!.builders.posts ?? []).toHaveLength(0);
    });

    it("stores the server-validated parent id on a brand-new draft", async () => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults(
          {
            data: { id: "parent-1", author_id: "parent-author", slug: "p", title: "T" },
            error: null,
          },
          { data: { id: "new-draft-id" }, error: null }
        ),
      });

      const result = await ensureDraft(
        baseDraftInput({ draftId: null, inResponseTo: "parent-1" })
      );

      expect(result).toEqual({ error: null, draftId: "new-draft-id" });
      const insertedWith = fakeSupabase.current!.builders.posts[1].insertedWith as Record<
        string,
        unknown
      >;
      expect(insertedWith.in_response_to).toBe("parent-1");
    });

    it("rejects saving an existing draft whose previously-attached parent is no longer published (e.g. removed mid-session)", async () => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: null, error: null }),
      });

      const result = await ensureDraft(
        baseDraftInput({ draftId: "draft-1", inResponseTo: "parent-1" })
      );

      expect(result).toEqual({
        error: "That post is no longer available to respond to.",
        draftId: null,
      });
      // Only the parent-validation read happened -- the existing-draft
      // classification select and the update were never reached.
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });

    it("does not require any parent validation at all when inResponseTo is absent", async () => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: { id: "new-draft-id" }, error: null }),
      });

      const result = await ensureDraft(baseDraftInput({ draftId: null, inResponseTo: null }));

      expect(result).toEqual({ error: null, draftId: "new-draft-id" });
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });
  });
});

describe("publishPost", () => {
  it("rejects postType=research outright before touching the database", async () => {
    fakeSupabase.current = makeFakeSupabase({});

    const result = await publishPost(basePublishInput({ postType: "research" }));

    expect(result.error).toMatch(/research submission flow/i);
    expect(result.slug).toBeNull();
    expect(fakeSupabase.current!.from).not.toHaveBeenCalled();
  });

  it("rejects a blank title server-side even though the client only offers Post/Article/Research", async () => {
    fakeSupabase.current = makeFakeSupabase({});

    const result = await publishPost(basePublishInput({ title: "   " }));

    expect(result.error).toMatch(/real title/i);
    expect(result.slug).toBeNull();
  });

  it.each(["policy_brief", "blog", "research_paper_fake"])(
    "publishes a brand-new submission as a generic Article immediately, ignoring spoofed postType=%s",
    async (spoofedType) => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: { id: "new-post-id" }, error: null }),
        ...standardPublishRoutes(),
      });

      const result = await publishPost(
        basePublishInput({ postType: spoofedType as never })
      );

      expect(result.error).toBeNull();
      expect(result.submittedForReview).toBe(false);
      const insertedWith = fakeSupabase.current!.builders.posts[0].insertedWith as Record<
        string,
        unknown
      >;
      expect(insertedWith.type).toBe("essay");
      expect(insertedWith.content_kind).toBe("article");
      expect(insertedWith.article_format).toBeNull();
      expect(insertedWith.status).toBe("published");
      expect(insertedWith.published_at).not.toBeNull();
    }
  );

  it("keeps an existing essay draft published-immediately even when the client spoofs postType=policy_brief", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { status: "draft", type: "essay" }, error: null },
        { data: [{ id: "draft-1" }], error: null }
      ),
      ...standardPublishRoutes(),
    });

    const result = await publishPost(
      basePublishInput({ draftId: "draft-1", postType: "policy_brief" })
    );

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.type).toBe("essay");
    expect(updatedWith.status).toBe("published");
    expect(updatedWith.content_kind).toBe("article");
  });

  it("preserves an existing Article draft's stored genre when the client omits articleFormat entirely", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { status: "draft", type: "essay", content_kind: "article", article_format: "policy_brief" }, error: null },
        { data: [{ id: "draft-1" }], error: null }
      ),
      ...standardPublishRoutes(),
    });

    const result = await publishPost(basePublishInput({ draftId: "draft-1" }));

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.article_format).toBe("policy_brief");
    expect(updatedWith.status).toBe("published");
  });

  it("clears an existing genre when the client explicitly picks General (articleFormat: null)", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { status: "draft", type: "essay", content_kind: "article", article_format: "policy_brief" }, error: null },
        { data: [{ id: "draft-1" }], error: null }
      ),
      ...standardPublishRoutes(),
    });

    const result = await publishPost(basePublishInput({ draftId: "draft-1", articleFormat: null }));

    expect(result.error).toBeNull();
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    expect(updatedWith.article_format).toBeNull();
  });

  it("converts a legacy Policy Brief DRAFT (never submitted) to an ordinary Policy-Brief-format Article at first publish, publishing immediately instead of entering review", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { status: "draft", type: "policy_brief" }, error: null },
        { data: [{ id: "draft-1" }], error: null }
      ),
      ...standardPublishRoutes(),
    });

    const result = await publishPost(basePublishInput({ draftId: "draft-1" }));

    expect(result.error).toBeNull();
    expect(result.submittedForReview).toBe(false);
    const updatedWith = fakeSupabase.current!.builders.posts[1].updatedWith as Record<string, unknown>;
    // Dual-writes type="essay" like any other new Article -- never the raw
    // legacy "policy_brief" value -- while its genre survives as
    // article_format metadata, per lib/contentModel.ts's
    // isLegacyPolicyBriefInFlight(): a draft was never actually "in flight"
    // in the old workflow (only pending/pending_revision counts), so
    // publishing it now must not start a brand-new review.
    expect(updatedWith.type).toBe("essay");
    expect(updatedWith.content_kind).toBe("article");
    expect(updatedWith.article_format).toBe("policy_brief");
    expect(updatedWith.status).toBe("published");
    expect(updatedWith.published_at).not.toBeNull();
  });

  it("refuses to publish an existing research draft through the Article action, regardless of requested postType", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({ data: { status: "draft", type: "research" }, error: null }),
    });

    const result = await publishPost(
      basePublishInput({ draftId: "draft-1", postType: "essay" })
    );

    expect(result.error).toMatch(/research submission flow/i);
    expect(result.slug).toBeNull();
    expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
  });

  it.each(["published", "pending", "pending_revision"])(
    "refuses to re-publish/overwrite an existing row that is no longer a draft (status=%s), e.g. via a stale ?draft= link kept after acceptance",
    async (status) => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({ data: { status, type: "essay" }, error: null }),
      });

      const result = await publishPost(
        basePublishInput({ draftId: "already-published-id" })
      );

      expect(result.error).toMatch(/no longer an editable draft/i);
      expect(result.slug).toBeNull();
      // Only the read happened -- no update was attempted against the row.
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    }
  );

  it("does not silently succeed when the row stops being a draft between the read and the write (TOCTOU race)", async () => {
    // Simulates a concurrent autosave/publish landing between this read and
    // write: the update's own `status = "draft"` filter matches zero rows.
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults(
        { data: { status: "draft", type: "essay" }, error: null },
        { data: [], error: null }
      ),
    });

    const result = await publishPost(basePublishInput({ draftId: "draft-1" }));

    expect(result.error).toMatch(/no longer an editable draft/i);
    expect(result.slug).toBeNull();
  });

  describe("response parent validation (Pass 3: Response Creation UX)", () => {
    it("rejects publishing a brand-new response whose claimed parent doesn't exist or isn't published", async () => {
      fakeSupabase.current = makeFakeSupabase({
        ...standardPublishRoutes(),
        posts: queueResults({ data: null, error: null }),
      });

      const result = await publishPost(
        basePublishInput({ draftId: null, inResponseTo: "missing-parent" })
      );

      expect(result).toEqual({
        error: "That post is no longer available to respond to.",
        slug: null,
      });
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });

    it("rejects an existing draft naming itself as its own parent", async () => {
      fakeSupabase.current = makeFakeSupabase({
        ...standardPublishRoutes(),
        posts: queueResults({
          data: { status: "draft", type: "essay", content_kind: "article", article_format: null },
          error: null,
        }),
      });

      const result = await publishPost(
        basePublishInput({ draftId: "draft-1", inResponseTo: "draft-1" })
      );

      expect(result).toEqual({
        error: "A post can't be a response to itself.",
        slug: null,
      });
      // Only the existing-draft classification read happened -- the
      // self-reference guard short-circuits before any further query
      // (the parent-lookup select) and before any write.
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });

    it("stores the server-validated parent id when publishing a brand-new response", async () => {
      fakeSupabase.current = makeFakeSupabase({
        ...standardPublishRoutes(),
        posts: queueResults(
          {
            data: { id: "parent-1", author_id: "parent-author", slug: "p", title: "T" },
            error: null,
          },
          { data: { id: "new-post-id" }, error: null }
        ),
      });

      const result = await publishPost(
        basePublishInput({ draftId: null, inResponseTo: "parent-1" })
      );

      expect(result.error).toBeNull();
      const insertedWith = fakeSupabase.current!.builders.posts[1].insertedWith as Record<
        string,
        unknown
      >;
      expect(insertedWith.in_response_to).toBe("parent-1");
    });

    it("does not require any parent validation at all when inResponseTo is absent", async () => {
      fakeSupabase.current = makeFakeSupabase({
        ...standardPublishRoutes(),
        posts: queueResults({ data: { id: "new-post-id" }, error: null }),
      });

      const result = await publishPost(basePublishInput({ draftId: null, inResponseTo: null }));

      expect(result.error).toBeNull();
      expect(fakeSupabase.current!.builders.posts).toHaveLength(1);
    });
  });
});

describe("savePostReferences", () => {
  it("saves references on an in-progress draft", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { author_id: "user-1", type: "essay", status: "draft" },
        error: null,
      }),
      post_references: queueResults({ data: [], error: null }),
    });

    const result = await savePostReferences({ postId: "draft-1", references: [] });

    expect(result.error).toBeNull();
  });

  it("refuses to edit references on a post owned by a different user", async () => {
    fakeSupabase.current = makeFakeSupabase({
      posts: queueResults({
        data: { author_id: "someone-else", type: "essay", status: "draft" },
        error: null,
      }),
    });

    const result = await savePostReferences({ postId: "draft-1", references: [] });

    expect(result.error).toMatch(/permission/i);
  });

  it.each(["published", "pending", "pending_revision", "removed"])(
    "refuses to edit references once the post is no longer a draft (status=%s)",
    async (status) => {
      fakeSupabase.current = makeFakeSupabase({
        posts: queueResults({
          data: { author_id: "user-1", type: "policy_brief", status },
          error: null,
        }),
      });

      const result = await savePostReferences({ postId: "post-1", references: [] });

      expect(result.error).toMatch(/no longer an editable draft/i);
    }
  );
});

describe("withdrawSubmission", () => {
  // withdrawSubmission() is a thin wrapper around the
  // withdraw_post_submission() Postgres RPC (see
  // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql):
  // every actual authorization/precondition/transactionality guarantee
  // (ownership, status, retiring active post_reviews assignments) lives in
  // that SECURITY DEFINER function, not in this action, so these tests only
  // verify the action calls the RPC correctly and propagates its result --
  // the RPC's own logic is covered by the JS-ported trigger/RPC tests in
  // lib/contentModel.test.ts.
  it("calls the withdraw_post_submission RPC with the given postId and returns no error on success", async () => {
    fakeSupabase.current = makeFakeSupabase(
      {},
      "user-1",
      { withdraw_post_submission: () => ({ data: { id: "post-1", status: "withdrawn" }, error: null }) }
    );

    const result = await withdrawSubmission({ postId: "post-1" });

    expect(result.error).toBeNull();
    expect(fakeSupabase.current!.rpcCalls).toEqual([
      { fn: "withdraw_post_submission", params: { target_post_id: "post-1" } },
    ]);
  });

  it("propagates the RPC's rejection message when the submission isn't withdrawable", async () => {
    fakeSupabase.current = makeFakeSupabase(
      {},
      "user-1",
      {
        withdraw_post_submission: () => ({
          data: null,
          error: { message: "Only a submission awaiting or in revision can be withdrawn." },
        }),
      }
    );

    const result = await withdrawSubmission({ postId: "post-1" });

    expect(result.error).toMatch(/awaiting or in revision/i);
  });

  it("requires the caller to be signed in before even attempting the RPC", async () => {
    fakeSupabase.current = makeFakeSupabase({}, null);

    const result = await withdrawSubmission({ postId: "post-1" });

    expect(result.error).toMatch(/signed in/i);
    expect(fakeSupabase.current!.rpc).not.toHaveBeenCalled();
  });
});
