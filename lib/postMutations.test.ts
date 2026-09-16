import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  deleteDraftPost,
  GENERIC_REFUSAL,
  postMutationMessage,
  publishOwnDraft,
  removePost,
  restorePost,
  transitionPost,
  updatePostContent,
} = await import("@/lib/postMutations");

import type { PostActor } from "@/lib/postPolicy";
import type { PostStatus } from "@/lib/types";

/**
 * The pipeline, with the database stubbed.
 *
 * What is asserted here is the part `lib/postPolicy.test.ts` cannot see: that
 * the decision is actually consulted before the statement, that the statement
 * carries the identity and state predicates, and above all that the affected
 * row count is checked.
 *
 * That last one is the whole reason this layer exists in this shape. On Neon,
 * RLS denies nothing (auth.uid() is NULL, so policies deny by matching
 * nothing, which for a WRITE means zero rows) and
 * guard_locked_post_write() enforces nothing (its bypass is an inequality that
 * an unrecognised role satisfies). An UPDATE whose row count nobody inspects
 * is then indistinguishable from a successful one.
 */

const AUTHOR = "author-1";
const author: PostActor = { kind: "author", userId: AUTHOR };
const admin: PostActor = { kind: "admin", userId: "admin-1" };

interface Recorded {
  op: "select" | "update" | "delete";
  filters: Array<[string, unknown]>;
  patch?: Record<string, unknown>;
}

/**
 * A Supabase stand-in that records what was asked and answers with what the
 * test says. `affected` is the number of rows the terminal `.select("id")`
 * reports, which is how a race is simulated.
 */
function makeClient(options: {
  snapshot?: Record<string, unknown> | null;
  affected?: number;
  lookupError?: string;
  writeError?: string;
}) {
  const calls: Recorded[] = [];
  const {
    snapshot = {
      id: "post-1",
      author_id: AUTHOR,
      status: "draft",
      content_kind: "article",
      citation_id: null,
      published_version_id: null,
    },
    affected = 1,
    lookupError,
    writeError,
  } = options;

  const client = {
    from() {
      const record: Recorded = { op: "select", filters: [] };
      calls.push(record);

      const chain: Record<string, unknown> = {
        select() {
          // The terminal select on a write returns the affected rows.
          if (record.op === "update" || record.op === "delete") {
            return Promise.resolve(
              writeError
                ? { data: null, error: { message: writeError } }
                : {
                    data: Array.from({ length: affected }, () => ({ id: "post-1" })),
                    error: null,
                  }
            );
          }
          return chain;
        },
        update(patch: Record<string, unknown>) {
          record.op = "update";
          record.patch = patch;
          return chain;
        },
        delete() {
          record.op = "delete";
          return chain;
        },
        eq(column: string, value: unknown) {
          record.filters.push([column, value]);
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(
            lookupError
              ? { data: null, error: { message: lookupError } }
              : { data: snapshot, error: null }
          );
        },
      };
      return chain;
    },
  } as never;

  return { client, calls };
}

const writeOf = (calls: Recorded[]) =>
  calls.find((call) => call.op === "update" || call.op === "delete");

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── The row count ────────────────────────────────────────────────────

describe("affected-row verification", () => {
  it("reports a conflict when the write matched nothing", () => {
    // The signal that replaces RLS. Zero rows means the row moved between the
    // load and the write, or the predicates did not match what was
    // authorized. Either way it is not success.
    return expect(
      updatePostContent(
        { supabase: makeClient({ affected: 0 }).client, actor: author },
        "post-1",
        { title: "New" }
      )
    ).resolves.toMatchObject({ ok: false, failure: { kind: "conflict" } });
  });

  it("succeeds on exactly one row", async () => {
    const result = await updatePostContent(
      { supabase: makeClient({ affected: 1 }).client, actor: author },
      "post-1",
      { title: "New" }
    );
    expect(result).toMatchObject({ ok: true, data: { id: "post-1" } });
  });

  it("refuses to call a multi-row write a success", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await updatePostContent(
      { supabase: makeClient({ affected: 3 }).client, actor: author },
      "post-1",
      { title: "New" }
    );
    expect(result).toMatchObject({ ok: false, failure: { kind: "conflict" } });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("checks the row count on deletes too", async () => {
    const result = await deleteDraftPost(
      { supabase: makeClient({ affected: 0 }).client, actor: author },
      "post-1"
    );
    expect(result).toMatchObject({ ok: false, failure: { kind: "conflict" } });
  });
});

// ── The predicates ───────────────────────────────────────────────────

describe("the statement restates what the policy authorized", () => {
  it("carries the id, the expected status and the author", async () => {
    const { client, calls } = makeClient({});
    await updatePostContent({ supabase: client, actor: author }, "post-1", {
      title: "New",
    });

    const write = writeOf(calls);
    const filters = Object.fromEntries(write!.filters);
    expect(filters.id).toBe("post-1");
    // The state the decision was made against. If an editor accepted the
    // submission in the meantime, this matches nothing.
    expect(filters.status).toBe("draft");
    expect(filters.author_id).toBe(AUTHOR);
  });

  it("does not constrain author_id for an admin, who writes rows they do not own", async () => {
    const { client, calls } = makeClient({
      snapshot: {
        id: "post-1",
        author_id: AUTHOR,
        status: "published",
        content_kind: "article",
        citation_id: null,
        published_version_id: null,
      },
    });
    await removePost({ supabase: client, actor: admin }, "post-1");

    const filters = Object.fromEntries(writeOf(calls)!.filters);
    expect(filters.author_id).toBeUndefined();
    expect(filters.status).toBe("published");
  });

  it("scopes an author's delete to their own draft", async () => {
    const { client, calls } = makeClient({});
    await deleteDraftPost({ supabase: client, actor: author }, "post-1");

    const filters = Object.fromEntries(writeOf(calls)!.filters);
    expect(filters.author_id).toBe(AUTHOR);
    expect(filters.status).toBe("draft");
  });
});

// ── The policy is actually consulted ─────────────────────────────────

describe("no write is issued when the policy refuses", () => {
  const refusalCases: Array<{
    name: string;
    snapshot: Record<string, unknown>;
    run: (client: never) => Promise<unknown>;
  }> = [
    {
      name: "hard-deleting a published post",
      snapshot: { status: "published" },
      run: (client) => deleteDraftPost({ supabase: client, actor: author }, "post-1"),
    },
    {
      name: "resurrecting a withdrawn submission",
      snapshot: { status: "withdrawn" },
      run: (client) =>
        transitionPost({ supabase: client, actor: author }, "post-1", "published"),
    },
    {
      name: "mutating a removed post",
      snapshot: { status: "removed" },
      run: (client) =>
        updatePostContent({ supabase: client, actor: author }, "post-1", {
          title: "Sneaky",
        }),
    },
    {
      name: "writing citation_id directly",
      snapshot: { status: "draft" },
      run: (client) =>
        updatePostContent({ supabase: client, actor: author }, "post-1", {
          citation_id: "INDEGENIUS-9",
        }),
    },
    {
      name: "reclassifying through an ordinary content edit",
      snapshot: { status: "draft" },
      run: (client) =>
        updatePostContent({ supabase: client, actor: author }, "post-1", {
          content_kind: "post",
        }),
    },
    {
      name: "submitting for review, which is no longer a transition",
      snapshot: { status: "draft" },
      run: (client) =>
        transitionPost({ supabase: client, actor: author }, "post-1", "pending"),
    },
    {
      name: "an author removing their own post, which is moderation",
      snapshot: { status: "published" },
      run: (client) => removePost({ supabase: client, actor: author }, "post-1"),
    },
    {
      name: "a stranger editing a draft they do not own",
      snapshot: { status: "draft", author_id: "someone-else" },
      run: (client) =>
        updatePostContent({ supabase: client, actor: author }, "post-1", {
          title: "Not mine",
        }),
    },
  ];

  for (const testCase of refusalCases) {
    it(`refuses ${testCase.name} and issues no statement`, async () => {
      const { client, calls } = makeClient({
        snapshot: {
          id: "post-1",
          author_id: AUTHOR,
          content_kind: "article",
          citation_id: null,
          published_version_id: null,
          ...testCase.snapshot,
        },
      });

      const result = (await testCase.run(client as never)) as { ok: boolean };
      expect(result.ok).toBe(false);
      // The important half: refusal happens before anything is written, so a
      // refused call cannot have had a partial effect.
      expect(writeOf(calls)).toBeUndefined();
    });
  }
});

// ── Valid flows still work ───────────────────────────────────────────

describe("the flows the product actually performs still succeed", () => {
  const ok = async (
    status: PostStatus,
    contentKind: string,
    actor: PostActor,
    run: (client: never) => Promise<{ ok: boolean }>
  ) => {
    const { client } = makeClient({
      snapshot: {
        id: "post-1",
        author_id: AUTHOR,
        status,
        content_kind: contentKind,
        citation_id: null,
        published_version_id: null,
      },
    });
    const result = await run(client as never);
    expect(result.ok, actor.kind + " " + status + " " + contentKind).toBe(true);
  };

  it("publishes an Article draft", () =>
    ok("draft", "article", author, (client) =>
      publishOwnDraft({ supabase: client, actor: author }, "post-1")
    ));

  it("publishes a Post draft", () =>
    ok("draft", "post", author, (client) =>
      publishOwnDraft({ supabase: client, actor: author }, "post-1")
    ));

  it("edits a published post, which review used to lock", () =>
    ok("published", "article", author, (client) =>
      updatePostContent({ supabase: client, actor: author }, "post-1", {
        title: "Corrected after publication",
      })
    ));

  it("lets an admin remove a post", () =>
    ok("published", "article", admin, (client) =>
      removePost({ supabase: client, actor: admin }, "post-1")
    ));

  it("lets an admin restore a removed post", () =>
    ok("removed", "article", admin, (client) =>
      restorePost({ supabase: client, actor: admin }, "post-1")
    ));

  it("edits draft content", () =>
    ok("draft", "article", author, (client) =>
      updatePostContent({ supabase: client, actor: author }, "post-1", {
        title: "Edited",
        content: "<p>x</p>",
      })
    ));
});

// ── Absence, failure, and what the reader is told ────────────────────

describe("a missing post and a broken database are different answers", () => {
  it("reports not_found when the lookup succeeded and matched nothing", async () => {
    const result = await updatePostContent(
      { supabase: makeClient({ snapshot: null }).client, actor: author },
      "post-1",
      { title: "New" }
    );
    expect(result).toMatchObject({ ok: false, failure: { kind: "not_found" } });
  });

  it("throws rather than reporting absence when the lookup itself failed", async () => {
    // Collapsing the two is what told every visitor that every post did not
    // exist while Supabase was unresponsive.
    await expect(
      updatePostContent(
        { supabase: makeClient({ lookupError: "connection timed out" }).client, actor: author },
        "post-1",
        { title: "New" }
      )
    ).rejects.toThrow(/post lookup failed/);
  });

  it("surfaces a write error as a failure, not a success", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await updatePostContent(
      { supabase: makeClient({ writeError: "deadlock detected" }).client, actor: author },
      "post-1",
      { title: "New" }
    );
    expect(result).toMatchObject({ ok: false, failure: { kind: "query_failed" } });
    error.mockRestore();
  });
});

describe("what the reader is told", () => {
  it("gives one generic answer for permission and existence", () => {
    // Distinguishing "not yours" from "does not exist" turns a mutation
    // endpoint into a lookup oracle.
    expect(postMutationMessage({ kind: "not_found" })).toBe(GENERIC_REFUSAL);
    expect(
      postMutationMessage({ kind: "refused", refusal: "not_owner", reason: "x" })
    ).toBe(GENERIC_REFUSAL);
    expect(
      postMutationMessage({ kind: "refused", refusal: "role_required", reason: "x" })
    ).toBe(GENERIC_REFUSAL);
  });

  it("explains the refusals that describe the product, not the permission system", () => {
    const message = postMutationMessage({
      kind: "refused",
      refusal: "delete_non_draft",
      reason: "Only drafts can be deleted directly.",
    });
    expect(message).toContain("Only drafts can be deleted directly.");
  });

  it("never puts a database message in front of a reader", () => {
    const message = postMutationMessage({
      kind: "query_failed",
      message: 'relation "posts" does not exist',
    });
    expect(message).not.toContain("relation");
    expect(message).not.toContain("posts");
  });

  it("tells the author to reload after a race", () => {
    expect(postMutationMessage({ kind: "conflict" })).toMatch(/reload/i);
  });
});

describe("no status change can ride along with a content edit", () => {
  it("has no general update path that accepts a status", async () => {
    const { client, calls } = makeClient({});
    const result = await updatePostContent(
      { supabase: client, actor: author },
      "post-1",
      { title: "New", status: "published" }
    );
    expect(result).toMatchObject({
      ok: false,
      failure: { refusal: "protected_field" },
    });
    expect(writeOf(calls)).toBeUndefined();
  });

  it("only ever writes the status a named transition chose", async () => {
    const { client, calls } = makeClient({});
    await transitionPost({ supabase: client, actor: author }, "post-1", "published");
    expect(writeOf(calls)!.patch).toMatchObject({ status: "published" });
  });
});
