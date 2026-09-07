import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server boundary in front of draft deletion.
 *
 * lib/postDeletion.test.ts covers who may delete what. This covers the gate in
 * front of it: that a signed-out caller never reaches the database at all, that
 * the input is bounded, and that the client is told a sentence rather than
 * whatever the database said.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const viewer = { current: null as { id: string } | null };
vi.mock("@/lib/serverAuth", () => ({
  getCurrentUser: async () => viewer.current,
}));

const supabaseCalls: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      supabaseCalls.push(table);
      throw new Error("the database must not be reached in these cases");
    },
  }),
}));

const plan = vi.hoisted(() => vi.fn());
const runDelete = vi.hoisted(() => vi.fn());
vi.mock("@/lib/postDeletion", () => ({
  planPostDeletion: plan,
  deleteOwnedDraftPosts: runDelete,
}));

const { deleteOwnDraftPosts } = await import("@/app/(write)/write/deleteActions");

const OWNED_DRAFT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  supabaseCalls.length = 0;
  viewer.current = { id: "author-1" };
  plan.mockReset();
  runDelete.mockReset();
});

describe("deleteOwnDraftPosts", () => {
  it("refuses a signed-out caller before touching the database", async () => {
    viewer.current = null;

    const result = await deleteOwnDraftPosts({ postIds: [OWNED_DRAFT] });

    expect(result).toEqual({ ok: false, error: "You must be signed in to do that." });
    expect(supabaseCalls).toEqual([]);
    expect(plan).not.toHaveBeenCalled();
  });

  it("never takes an author id from the caller", async () => {
    // The whole point of the migration. Passing one has to be a type error and
    // must have no effect at runtime either.
    plan.mockResolvedValue({
      plan: { deletable: [OWNED_DRAFT], refused: [], missing: [] },
    });
    runDelete.mockResolvedValue({ deleted: [OWNED_DRAFT] });

    await deleteOwnDraftPosts({
      postIds: [OWNED_DRAFT],
      // @ts-expect-error the action accepts no such field
      viewerId: "someone-else",
    });

    expect(plan).toHaveBeenCalledWith(expect.anything(), {
      postIds: [OWNED_DRAFT],
      viewerId: "author-1",
    });
  });

  it("rejects an id that is not a uuid rather than sending it on", async () => {
    const result = await deleteOwnDraftPosts({ postIds: ["'; drop table posts; --"] });

    expect(result).toEqual({ ok: false, error: "Nothing was selected to delete." });
    expect(plan).not.toHaveBeenCalled();
  });

  it("bounds the batch", async () => {
    // Distinct ids: the action deduplicates before counting, so 51 copies of
    // one id would be a batch of one and would not exercise the cap.
    const many = Array.from(
      { length: 51 },
      (_unused, index) =>
        `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`
    );
    const result = await deleteOwnDraftPosts({ postIds: many });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most 50/);
  });

  it("says why a submission was refused, without naming a trigger", async () => {
    plan.mockResolvedValue({ plan: { deletable: [], refused: [OTHER], missing: [] } });

    const result = await deleteOwnDraftPosts({ postIds: [OTHER] });

    expect(result).toEqual({
      ok: false,
      error: "Only drafts can be deleted. Withdraw a submission instead of deleting it.",
    });
    expect(runDelete).not.toHaveBeenCalled();
  });

  it("gives one answer for a missing post and for someone else's", async () => {
    plan.mockResolvedValue({ plan: { deletable: [], refused: [], missing: [OTHER] } });

    const result = await deleteOwnDraftPosts({ postIds: [OTHER] });

    expect(result).toEqual({
      ok: false,
      error: "That item does not exist, or you do not have permission to change it.",
    });
  });

  it("returns what was deleted, and counts what was not", async () => {
    plan.mockResolvedValue({
      plan: { deletable: [OWNED_DRAFT], refused: [OTHER], missing: [] },
    });
    runDelete.mockResolvedValue({ deleted: [OWNED_DRAFT] });

    const result = await deleteOwnDraftPosts({ postIds: [OWNED_DRAFT, OTHER] });

    expect(result).toEqual({
      ok: true,
      data: { deleted: [OWNED_DRAFT], refusedCount: 1 },
    });
  });

  it("does not report a delete that the statement did not make", async () => {
    // The plan is a read and the delete is a separate write. A row that
    // changed status in between comes back as deleted: [] and must stay on the
    // caller's screen.
    plan.mockResolvedValue({
      plan: { deletable: [OWNED_DRAFT], refused: [], missing: [] },
    });
    runDelete.mockResolvedValue({ deleted: [] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await deleteOwnDraftPosts({ postIds: [OWNED_DRAFT] });

    expect(result).toEqual({ ok: true, data: { deleted: [], refusedCount: 0 } });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("turns a failed lookup into a sentence", async () => {
    plan.mockResolvedValue({ error: "query_failed" });

    const result = await deleteOwnDraftPosts({ postIds: [OWNED_DRAFT] });

    expect(result).toEqual({ ok: false, error: "Could not check those drafts. Try again." });
  });
});
