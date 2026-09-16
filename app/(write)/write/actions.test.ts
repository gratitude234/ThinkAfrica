import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, queueResults } from "@/lib/testUtils/supabaseMock";

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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { ensureContributionDraft, publishContribution } from "./actions";
import type { ContributionSnapshot } from "@/lib/contribution";

/** The tables publishContribution touches besides "posts": the sources, and the
 *  writer's own credit row. */
function standardPublishRoutes() {
  return {
    post_references: queueResults({ data: [], error: null }),
    post_authors: queueResults({ data: null, error: null }),
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true }))
  );
});

/**
 * The row lib/postMutations.ts loads before it authorizes a write.
 *
 * Every domain operation reads it, so it is queued alongside the results a
 * test is actually describing. It is not an extra statement the action chose
 * to make: it is how the write is authorized at all, now that the decision is
 * the application's rather than a trigger's.
 */
function policySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: "draft-1",
      author_id: "user-1",
      status: "draft",
      type: "essay",
      content_kind: "article",
      article_format: null,
      citation_id: null,
      published_version_id: null,
      ...overrides,
    },
    error: null,
  };
}

describe("publishContribution", () => {
  function contribution(overrides: Partial<ContributionSnapshot> = {}): ContributionSnapshot {
    return {
      title: "",
      content: "<p>A body-first idea that keeps going.</p>",
      excerpt: "",
      tags: [],
      coverImageUrl: "",
      references: [],
      ...overrides,
    };
  }

  // The slug is minted on the first autosave, before a body-first writer has
  // usually reached for a title, so it is seeded from the opening words.
  const BODY_SEEDED_SLUG = "a-body-first-idea-that-keeps-mabc-1z2y3x";

  function publishRoutes(posts: ReturnType<typeof queueResults>) {
    return { posts, ...standardPublishRoutes() };
  }

  it("renames a body-seeded slug after the title the writer settled on", async () => {
    fakeSupabase.current = makeFakeSupabase(
      publishRoutes(
        queueResults(
          { data: { id: "draft-1" }, error: null },
          { data: { id: "draft-1", slug: BODY_SEEDED_SLUG, status: "draft" }, error: null },
          policySnapshot(),
          { data: [{ id: "draft-1" }], error: null },
          policySnapshot(),
          { data: [{ id: "draft-1" }], error: null }
        )
      )
    );

    const result = await publishContribution({
      draftId: null,
      snapshot: contribution({ title: "One continuous workflow" }),
    });

    expect(result.error).toBeNull();
    // The suffix is random and is no longer read back out of the database:
    // renamePostSlug returns the slug it wrote. What matters is that the
    // publish happened on a slug named after the title.
    expect(result.slug).toMatch(/^one-continuous-workflow-/);
    const rename = fakeSupabase.current!.builders.posts[3].updatedWith as { slug: string };
    expect(rename.slug).toBe(result.slug);
  });

  it("keeps the body-seeded slug when the writer never adds a title", async () => {
    fakeSupabase.current = makeFakeSupabase(
      publishRoutes(
        queueResults(
          { data: { id: "draft-1" }, error: null },
          { data: { id: "draft-1", slug: BODY_SEEDED_SLUG, status: "draft" }, error: null },
          policySnapshot(),
          { data: [{ id: "draft-1" }], error: null }
        )
      )
    );

    const result = await publishContribution({ draftId: null, snapshot: contribution() });

    expect(result.error).toBeNull();
    expect(result.slug).toBe(BODY_SEEDED_SLUG);
    // Insert, read back, the domain authorization snapshot, publish. No
    // rename in between.
    expect(fakeSupabase.current!.builders.posts).toHaveLength(4);
  });

  it("leaves a slug alone when it already comes from the title", async () => {
    fakeSupabase.current = makeFakeSupabase(
      publishRoutes(
        queueResults(
          { data: { id: "draft-1" }, error: null },
          {
            data: { id: "draft-1", slug: "one-continuous-workflow-mabc-1z2y3x", status: "draft" },
            error: null,
          },
          policySnapshot(),
          { data: [{ id: "draft-1" }], error: null }
        )
      )
    );

    const result = await publishContribution({
      draftId: null,
      snapshot: contribution({ title: "One continuous workflow" }),
    });

    expect(result.slug).toBe("one-continuous-workflow-mabc-1z2y3x");
    expect(fakeSupabase.current!.builders.posts).toHaveLength(4);
  });

  it("publishes on the original slug when the rename cannot be written", async () => {
    fakeSupabase.current = makeFakeSupabase(
      publishRoutes(
        queueResults(
          { data: { id: "draft-1" }, error: null },
          { data: { id: "draft-1", slug: BODY_SEEDED_SLUG, status: "draft" }, error: null },
          policySnapshot(),
          // The rename matches nothing, which the domain reports as a
          // conflict rather than as success.
          { data: [], error: null },
          policySnapshot(),
          { data: [{ id: "draft-1" }], error: null }
        )
      )
    );

    const result = await publishContribution({
      draftId: null,
      snapshot: contribution({ title: "One continuous workflow" }),
    });

    // A cosmetic URL is never worth failing a publish over.
    expect(result.error).toBeNull();
    expect(result.slug).toBe(BODY_SEEDED_SLUG);
  });

  it("publishes without sending a notification or recording a prompt submission", async () => {
    fakeSupabase.current = makeFakeSupabase(
      publishRoutes(
        queueResults(
          { data: { id: "draft-1" }, error: null },
          { data: { id: "draft-1", slug: BODY_SEEDED_SLUG, status: "draft" }, error: null },
          policySnapshot(),
          { data: [{ id: "draft-1" }], error: null }
        )
      )
    );

    const result = await publishContribution({ draftId: null, snapshot: contribution() });

    expect(result.error).toBeNull();
    // Response and co-author notifications, and campus prompt submissions,
    // were retired with the flows that wrote them.
    const tables = Object.keys(fakeSupabase.current!.builders);
    expect(tables).not.toContain("notifications");
    expect(tables).not.toContain("campus_prompt_submissions");
    expect(tables).not.toContain("profiles");
  });

  it("rejects an orphaned citation before creating anything", async () => {
    fakeSupabase.current = makeFakeSupabase({});

    const result = await publishContribution({
      draftId: null,
      snapshot: contribution({
        content:
          '<p>A claim <a href="#ref-id-11111111-1111-4111-8111-111111111111">[source]</a></p>',
      }),
    });

    expect(result.error).toMatch(/source that was removed/i);
    expect(fakeSupabase.current!.from).not.toHaveBeenCalled();
  });
});

describe("ensureContributionDraft revision history", () => {
  function snapshot(overrides: Partial<ContributionSnapshot> = {}): ContributionSnapshot {
    return {
      title: "",
      content: "<p>A body-first idea that keeps going.</p>",
      excerpt: "",
      tags: [],
      coverImageUrl: "",
      references: [],
      ...overrides,
    };
  }

  function draftRoutes() {
    return {
      posts: queueResults({ data: { id: "draft-1" }, error: null }),
      post_references: queueResults({ data: [], error: null }),
      post_authors: queueResults({ data: null, error: null }),
    };
  }

  it("records a restore point alongside the save", async () => {
    fakeSupabase.current = makeFakeSupabase(draftRoutes());

    const result = await ensureContributionDraft({ draftId: null, snapshot: snapshot() });

    expect(result.error).toBeNull();
    const call = fakeSupabase.current!.rpcCalls.find((entry) => entry.fn === "record_post_revision");
    expect(call).toBeDefined();
    expect(call!.params).toMatchObject({ target_post_id: "draft-1", p_word_count: 6 });
  });

  it("snapshots the sanitized body, not the raw editor output", async () => {
    fakeSupabase.current = makeFakeSupabase(draftRoutes());

    await ensureContributionDraft({
      draftId: null,
      snapshot: snapshot({ content: "<p>Keep this.</p><script>alert(1)</script>" }),
    });

    const call = fakeSupabase.current!.rpcCalls.find((entry) => entry.fn === "record_post_revision");
    expect((call!.params as { p_content: string }).p_content).not.toContain("script");
  });

  it("credits the writer on their own draft, insert-only, and invites nobody", async () => {
    fakeSupabase.current = makeFakeSupabase(draftRoutes());

    const result = await ensureContributionDraft({ draftId: null, snapshot: snapshot() });

    expect(result.error).toBeNull();
    // The post_references read policy admits a draft's sources only through
    // is_post_coauthor(), so the owner row is what lets the writer see them.
    const credits = fakeSupabase.current!.builders.post_authors;
    expect(credits).toHaveLength(1);
    expect(credits[0].upsertedWith).toMatchObject({
      post_id: "draft-1",
      user_id: "user-1",
      display_order: 0,
    });
    expect(credits[0].insertedWith).toBeUndefined();
    expect(credits[0].updatedWith).toBeUndefined();
  });

  // A history write is a courtesy. Failing one must never be reported to the
  // writer as "we couldn't save your draft", because the draft did save.
  it("still reports success when the history write fails", async () => {
    fakeSupabase.current = makeFakeSupabase(draftRoutes(), "user-1", {
      record_post_revision: () => ({ data: null, error: { message: "history unavailable" } }),
    });

    const result = await ensureContributionDraft({ draftId: null, snapshot: snapshot() });

    expect(result.error).toBeNull();
    expect(result.draftId).toBe("draft-1");
  });
});
