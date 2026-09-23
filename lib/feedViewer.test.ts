import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const blocking = vi.hoisted(() => ({ getFeedExcludedUserIds: vi.fn() }));
vi.mock("@/lib/blocking", () => blocking);
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { loadFeedViewer } = await import("./feedViewer");

type Result = { data: unknown; error: unknown };

/**
 * A client that answers each table with a fixed result and remembers every
 * read it was asked for, so the contract below is about what the loader reads
 * rather than how it spells the query.
 */
function countingClient(
  tables: Record<string, Result> = {},
  rpcResult: Result = {
    data: null,
    error: { code: "PGRST202", message: "function is not installed in this test" },
  }
) {
  const reads: string[] = [];
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const client = {
    from: vi.fn((table: string) => {
      reads.push(table);
      const result = tables[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit"]) {
        builder[method] = vi.fn(() => builder);
      }
      builder.maybeSingle = vi.fn(async () => result);
      builder.single = vi.fn(async () => result);
      builder.then = (
        resolve: (value: Result) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    }),
    rpc,
  };
  return { client, reads, rpc };
}

describe("loadFeedViewer: Home's reader context", () => {
  beforeEach(() => {
    blocking.getFeedExcludedUserIds.mockReset();
    blocking.getFeedExcludedUserIds.mockResolvedValue(["blocked-1"]);
  });

  it("reads nothing for a signed-out reader", async () => {
    const { client, reads, rpc } = countingClient();

    expect(await loadFeedViewer(client, null)).toEqual({
      userId: null,
      userInterests: [],
      followedIds: [],
      excludedAuthorIds: [],
    });
    expect(reads).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    expect(blocking.getFeedExcludedUserIds).not.toHaveBeenCalled();
  });

  it("falls back to the legacy reads only when the context RPC is not installed", async () => {
    const { client, reads, rpc } = countingClient({
      profiles: { data: { interests: ["Climate", 42] }, error: null },
      follows: {
        data: [{ following_id: "writer-1" }, { following_id: null }],
        error: null,
      },
    });

    const viewer = await loadFeedViewer(client, "user-1");

    expect(viewer).toEqual({
      userId: "user-1",
      userInterests: ["Climate"],
      followedIds: ["writer-1"],
      excludedAuthorIds: ["blocked-1"],
    });
    expect([...reads].sort()).toEqual(["follows", "profiles"]);
    expect(blocking.getFeedExcludedUserIds).toHaveBeenCalledTimes(1);
    expect(blocking.getFeedExcludedUserIds).toHaveBeenCalledWith("user-1", {
      strict: true,
    });
    expect(rpc).toHaveBeenCalledWith("get_feed_viewer_context", {
      p_user_id: "user-1",
      p_personalized: true,
    });
  });

  it("uses one viewer-context RPC when the migration is installed", async () => {
    const { client, reads, rpc } = countingClient(
      {},
      {
        data: [
          {
            user_interests: ["Climate"],
            followed_ids: ["writer-1"],
            excluded_author_ids: ["blocked-1"],
          },
        ],
        error: null,
      }
    );

    await expect(loadFeedViewer(client, "user-1")).resolves.toEqual({
      userId: "user-1",
      userInterests: ["Climate"],
      followedIds: ["writer-1"],
      excludedAuthorIds: ["blocked-1"],
    });
    expect(reads).toEqual([]);
    expect(blocking.getFeedExcludedUserIds).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("keeps the block list and reads no personal signal when depersonalized", async () => {
    const { client, reads } = countingClient();

    const viewer = await loadFeedViewer(client, "user-1", { personalized: false });

    expect(viewer).toEqual({
      userId: null,
      userInterests: [],
      followedIds: [],
      excludedAuthorIds: ["blocked-1"],
    });
    expect(reads).toEqual([]);
  });

  it("reports a failed read instead of ranking as if the reader followed nobody", async () => {
    const { client } = countingClient({
      profiles: { data: { interests: [] }, error: null },
      follows: { data: null, error: { code: "57014", message: "timeout" } },
    });

    await expect(loadFeedViewer(client, "user-1")).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load followed writers",
      code: "57014",
    });
  });
});
