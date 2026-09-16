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
function countingClient(tables: Record<string, Result> = {}) {
  const reads: string[] = [];
  const rpc = vi.fn();
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

  it("reads the chosen topics, the follows and the blocks, and nothing else", async () => {
    // Home used to fan out to nine parallel queries before its feed started:
    // featured candidates, subscriptions, the private profile, onboarding
    // state, suggested people and an activation checklist among them. Three
    // reads is the whole of it now. A fourth needs a reason.
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
    expect(rpc).not.toHaveBeenCalled();
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
