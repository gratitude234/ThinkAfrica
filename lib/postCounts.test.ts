import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBookmarkCountsByPostId,
  getReferenceCountsByPostId,
  getVisibleCommentCountsByPostId,
  resetPostCountWarnings,
} from "./postCounts";
import { makeBuilder } from "@/lib/testUtils/supabaseMock";

afterEach(() => {
  resetPostCountWarnings();
  vi.restoreAllMocks();
});

/**
 * A client whose tables answer from `routes`, recording which tables were
 * asked. Anything not listed answers `{ data: null }`, which is how a table
 * that has not been migrated yet behaves as far as the caller can tell.
 */
function client(
  routes: Record<string, { data: unknown; error?: unknown }> = {},
  rpc?: (fn: string, params?: Record<string, unknown>) => unknown
) {
  const asked: string[] = [];
  return {
    asked,
    from: vi.fn((table: string) => {
      asked.push(table);
      return makeBuilder(routes[table] ?? { data: null, error: null });
    }),
    ...(rpc ? { rpc: vi.fn(rpc) as never } : {}),
  };
}

describe("getBookmarkCountsByPostId", () => {
  it("reads the maintained aggregate rather than tallying rows", async () => {
    const supabase = client({
      post_bookmark_counts: {
        data: [
          { post_id: "post-1", bookmark_count: 4200 },
          { post_id: "post-2", bookmark_count: 0 },
        ],
        error: null,
      },
    });

    const counts = await getBookmarkCountsByPostId(supabase as never, [
      "post-1",
      "post-2",
    ]);

    expect(counts).toEqual({ "post-1": 4200, "post-2": 0 });
    // The whole point: 4,200 bookmarks did not cross the wire to produce 4200.
    expect(supabase.asked).not.toContain("bookmarks");
  });

  it("falls back to counting rows when the aggregate is not there yet", async () => {
    // These migrations are applied by hand, so the deploy that ships this code
    // and the migration that creates the table are not the same moment.
    const supabase = client({
      bookmarks: {
        data: [{ post_id: "post-1" }, { post_id: "post-1" }],
        error: null,
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const counts = await getBookmarkCountsByPostId(supabase as never, ["post-1"]);

    expect(counts).toEqual({ "post-1": 2 });
    expect(supabase.asked).toEqual(["post_bookmark_counts", "bookmarks"]);
  });

  it("surfaces a genuine failure from the fallback instead of reporting zero", async () => {
    const supabase = client({
      bookmarks: { data: null, error: { code: "XX000", message: "down" } },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      getBookmarkCountsByPostId(supabase as never, ["post-1"])
    ).rejects.toMatchObject({ operation: "count bookmarks", code: "XX000" });
  });

  it("asks nothing at all for an empty id list", async () => {
    const supabase = client();

    expect(await getBookmarkCountsByPostId(supabase as never, [])).toEqual({});
    expect(supabase.asked).toEqual([]);
  });
});

describe("getReferenceCountsByPostId", () => {
  it("reads the maintained aggregate", async () => {
    const supabase = client({
      post_reference_counts: {
        data: [{ post_id: "post-1", reference_count: 7 }],
        error: null,
      },
    });

    expect(
      await getReferenceCountsByPostId(supabase as never, ["post-1"])
    ).toEqual({ "post-1": 7 });
    expect(supabase.asked).not.toContain("post_references");
  });
});

describe("getVisibleCommentCountsByPostId", () => {
  it("counts through the caller's own RLS, in the database", async () => {
    const calls: Array<{ fn: string; params: unknown }> = [];
    const supabase = client({}, (fn, params) => {
      calls.push({ fn, params });
      return Promise.resolve({
        data: [{ post_id: "post-1", comment_count: 12 }],
        error: null,
      });
    });

    const counts = await getVisibleCommentCountsByPostId(supabase as never, [
      "post-1",
    ]);

    expect(counts).toEqual({ "post-1": 12 });
    expect(calls).toEqual([
      { fn: "count_visible_comments_by_post", params: { p_post_ids: ["post-1"] } },
    ]);
    expect(supabase.asked).toEqual([]);
  });

  it("reads an empty answer as no comments, not as a missing function", async () => {
    const supabase = client({}, () =>
      Promise.resolve({ data: [], error: null })
    );

    expect(
      await getVisibleCommentCountsByPostId(supabase as never, ["post-1"])
    ).toEqual({});
    expect(supabase.asked).toEqual([]);
  });

  it("falls back to the per-viewer row count when the function is missing", async () => {
    const supabase = client(
      { comments: { data: [{ post_id: "post-1" }], error: null } },
      () =>
        Promise.resolve({
          data: null,
          error: { code: "PGRST202", message: "not found" },
        })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      await getVisibleCommentCountsByPostId(supabase as never, ["post-1"])
    ).toEqual({ "post-1": 1 });
    expect(supabase.asked).toEqual(["comments"]);
  });

  it("falls back when the client has no rpc at all", async () => {
    const supabase = client({
      comments: { data: [{ post_id: "post-1" }], error: null },
    });

    expect(
      await getVisibleCommentCountsByPostId(supabase as never, ["post-1"])
    ).toEqual({ "post-1": 1 });
  });
});
