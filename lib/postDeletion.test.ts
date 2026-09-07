import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { planPostDeletion, deleteOwnedDraftPosts, DELETABLE_POST_STATUS } =
  await import("@/lib/postDeletion");

/**
 * Who may delete a post, now that the browser no longer decides.
 *
 * The cases below are the ones the old client-side delete got right only by
 * accident: it sent `.delete().eq("id", id)` and let RLS and
 * `guard_locked_post_write` sort out ownership and status. Both of those
 * disappear on a direct PostgreSQL connection, so each is asserted here as
 * application behaviour.
 */

type Row = { id: string; author_id: string; status: string };

/**
 * A PostgREST builder is a thenable: the chain records filters and awaiting it
 * runs the query. This stands in for exactly that, so the module under test is
 * exercised through the same shape it uses in production.
 */
function fakeSupabase(
  rows: Row[],
  options: { selectError?: unknown; deleteError?: unknown } = {}
) {
  const calls = {
    selected: [] as string[][],
    deleteFilters: [] as Array<Record<string, unknown>>,
  };

  const client = {
    from(table: string) {
      expect(table).toBe("posts");
      let operation: "select" | "delete" = "select";
      const filters: Record<string, unknown> = {};

      function run() {
        const requested = (filters.id as string[]) ?? [];
        if (operation === "select") {
          calls.selected.push(requested);
          if (options.selectError) return { data: null, error: options.selectError };
          return {
            data: rows.filter((row) => requested.includes(row.id)),
            error: null,
          };
        }

        calls.deleteFilters.push({ ...filters });
        if (options.deleteError) return { data: null, error: options.deleteError };
        return {
          data: rows
            .filter(
              (row) =>
                requested.includes(row.id) &&
                row.author_id === filters.author_id &&
                row.status === filters.status
            )
            .map((row) => ({ id: row.id })),
          error: null,
        };
      }

      const builder = {
        select() {
          return builder;
        },
        delete() {
          operation = "delete";
          return builder;
        },
        in(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        then(
          onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(run()).then(onFulfilled, onRejected);
        },
      };

      return builder as never;
    },
  };

  return { calls, client };
}

const draft: Row = { id: "post-1", author_id: "author-1", status: "draft" };
const pending: Row = { id: "post-2", author_id: "author-1", status: "pending" };
const someoneElses: Row = { id: "post-3", author_id: "author-2", status: "draft" };

describe("planPostDeletion", () => {
  it("lets an author delete their own draft", async () => {
    const { client } = fakeSupabase([draft]);
    const result = await planPostDeletion(client, {
      postIds: ["post-1"],
      viewerId: "author-1",
    });

    expect(result).toEqual({
      plan: { deletable: ["post-1"], refused: [], missing: [] },
    });
  });

  it("refuses a post the viewer does not own", async () => {
    const { client } = fakeSupabase([someoneElses]);
    const result = await planPostDeletion(client, {
      postIds: ["post-3"],
      viewerId: "author-1",
    });

    expect(result).toEqual({
      plan: { deletable: [], refused: [], missing: ["post-3"] },
    });
  });

  it("refuses a post that is past draft, whoever owns it", async () => {
    // guard_locked_post_write says the same thing in the database. Saying it
    // here too is what turns a trigger exception into a sentence.
    const { client } = fakeSupabase([pending]);
    const result = await planPostDeletion(client, {
      postIds: ["post-2"],
      viewerId: "author-1",
    });

    expect(result).toEqual({
      plan: { deletable: [], refused: ["post-2"], missing: [] },
    });
    expect(DELETABLE_POST_STATUS).toBe("draft");
  });

  it("treats a post that does not exist the same as one that is not yours", async () => {
    // Distinguishing them turns the endpoint into an existence oracle for
    // private drafts.
    const { client } = fakeSupabase([]);
    const result = await planPostDeletion(client, {
      postIds: ["post-missing"],
      viewerId: "author-1",
    });

    expect(result).toEqual({
      plan: { deletable: [], refused: [], missing: ["post-missing"] },
    });
  });

  it("partitions a mixed sweep rather than refusing all of it", async () => {
    const { client } = fakeSupabase([draft, pending, someoneElses]);
    const result = await planPostDeletion(client, {
      postIds: ["post-1", "post-2", "post-3", "post-missing"],
      viewerId: "author-1",
    });

    expect(result).toEqual({
      plan: {
        deletable: ["post-1"],
        refused: ["post-2"],
        missing: ["post-3", "post-missing"],
      },
    });
  });

  it("deduplicates ids before asking the database", async () => {
    const { client, calls } = fakeSupabase([draft]);
    await planPostDeletion(client, {
      postIds: ["post-1", "post-1", "post-1"],
      viewerId: "author-1",
    });
    expect(calls.selected).toEqual([["post-1"]]);
  });

  it("reports a failed lookup instead of assuming nothing was owned", async () => {
    const { client } = fakeSupabase([draft], { selectError: { message: "timeout" } });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      planPostDeletion(client, { postIds: ["post-1"], viewerId: "author-1" })
    ).resolves.toEqual({ error: "query_failed" });

    error.mockRestore();
  });

  it("asks nothing of the database for an empty request", async () => {
    const { client, calls } = fakeSupabase([]);
    const result = await planPostDeletion(client, { postIds: [], viewerId: "author-1" });
    expect(result).toEqual({ plan: { deletable: [], refused: [], missing: [] } });
    expect(calls.selected).toEqual([]);
  });
});

describe("deleteOwnedDraftPosts", () => {
  it("repeats the ownership and status predicates in the statement", async () => {
    // The plan is a read and this is a separate write. A post submitted for
    // review between the two must not be deleted on a stale answer.
    const { client, calls } = fakeSupabase([draft]);
    await deleteOwnedDraftPosts(client, { postIds: ["post-1"], viewerId: "author-1" });

    expect(calls.deleteFilters).toEqual([
      { id: ["post-1"], author_id: "author-1", status: "draft" },
    ]);
  });

  it("reports the rows that actually went, not the rows that were asked for", async () => {
    // The row changed status underneath the plan, so the statement matches
    // nothing and the caller must not remove it from the list on screen.
    const { client } = fakeSupabase([pending]);
    const result = await deleteOwnedDraftPosts(client, {
      postIds: ["post-2"],
      viewerId: "author-1",
    });

    expect(result).toEqual({ deleted: [] });
  });

  it("cannot delete another author's row even when asked to", async () => {
    const { client } = fakeSupabase([someoneElses]);
    const result = await deleteOwnedDraftPosts(client, {
      postIds: ["post-3"],
      viewerId: "author-1",
    });

    expect(result).toEqual({ deleted: [] });
  });

  it("surfaces a failed delete rather than reporting an empty success", async () => {
    const { client } = fakeSupabase([draft], { deleteError: { message: "deadlock" } });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      deleteOwnedDraftPosts(client, { postIds: ["post-1"], viewerId: "author-1" })
    ).resolves.toEqual({ error: "query_failed" });

    error.mockRestore();
  });
});
