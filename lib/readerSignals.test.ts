import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import {
  getReaderAffinity,
  getViewerPostEngagement,
  resetReaderSignalWarnings,
} from "./readerSignals";

beforeEach(() => {
  // Without a service-role key these read through the caller's client rather
  // than the cached admin path, which is what keeps these tests hermetic.
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetReaderSignalWarnings();
  vi.restoreAllMocks();
});

function rpcClient(
  handler: (fn: string, params?: Record<string, unknown>) => unknown
) {
  const calls: Array<{ fn: string; params: unknown }> = [];
  return {
    calls,
    rpc: vi.fn((fn: string, params?: Record<string, unknown>) => {
      calls.push({ fn, params });
      return Promise.resolve(handler(fn, params));
    }),
  };
}

describe("getReaderAffinity", () => {
  it("scales weights against this reader's own strongest preference", async () => {
    // Someone who finishes four things a month and someone who finishes four
    // hundred should both be able to say "this one, most of all".
    const client = rpcClient(() => ({
      data: [
        { kind: "author", key: "author-1", weight: 10 },
        { kind: "author", key: "author-2", weight: 5 },
        { kind: "topic", key: "energy policy", weight: 4 },
        { kind: "topic", key: "trade", weight: 1 },
      ],
      error: null,
    }));

    const affinity = await getReaderAffinity(client as never, "reader-1");

    expect(affinity.authors.get("author-1")).toBe(1);
    expect(affinity.authors.get("author-2")).toBe(0.5);
    expect(affinity.topics.get("energy policy")).toBe(1);
    expect(affinity.topics.get("trade")).toBe(0.25);
  });

  it("normalizes topic keys so they match the tags on a post", async () => {
    const client = rpcClient(() => ({
      data: [{ kind: "topic", key: "  Public   Policy  ", weight: 3 }],
      error: null,
    }));

    const affinity = await getReaderAffinity(client as never, "reader-1");

    expect(affinity.topics.get("public policy")).toBe(1);
  });

  it("asks nothing for a signed-out reader", async () => {
    const client = rpcClient(() => ({ data: [], error: null }));

    const affinity = await getReaderAffinity(client as never, null);

    expect(affinity.authors.size).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it("ranks without the signal rather than failing when it is unavailable", async () => {
    // The migration is applied by hand. A feed that breaks between the deploy
    // and the migration would be a far worse outcome than one that ranks the
    // way it did last week.
    const client = rpcClient(() => ({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    }));

    const affinity = await getReaderAffinity(client as never, "reader-1");

    expect(affinity.authors.size).toBe(0);
    expect(affinity.topics.size).toBe(0);
  });

  it("survives the client throwing outright", async () => {
    const client = {
      rpc: vi.fn(() => {
        throw new Error("connection reset");
      }),
    };

    const affinity = await getReaderAffinity(client as never, "reader-1");

    expect(affinity.topics.size).toBe(0);
  });

  it("discards malformed rows instead of scoring them", async () => {
    const client = rpcClient(() => ({
      data: [
        { kind: "author", key: "author-1", weight: 4 },
        { kind: "nonsense", key: "author-2", weight: 9 },
        { kind: "author", key: "", weight: 9 },
        { kind: "author", key: "author-3", weight: -1 },
      ],
      error: null,
    }));

    const affinity = await getReaderAffinity(client as never, "reader-1");

    expect(Array.from(affinity.authors.keys())).toEqual(["author-1"]);
  });
});

describe("getViewerPostEngagement", () => {
  it("asks only about the candidates being ranked", async () => {
    const client = rpcClient(() => ({
      data: [{ post_id: "post-1", impressions: 3, has_read: true }],
      error: null,
    }));

    const engagement = await getViewerPostEngagement(client as never, "reader-1", [
      "post-1",
      "post-2",
      "post-1",
    ]);

    expect(engagement.get("post-1")).toEqual({ impressions: 3, hasRead: true });
    expect(engagement.get("post-2")).toBeUndefined();
    expect(
      (client.calls[0].params as { p_post_ids: string[] }).p_post_ids
    ).toEqual(["post-1", "post-2"]);
  });

  it("asks nothing for a signed-out reader or an empty candidate list", async () => {
    const client = rpcClient(() => ({ data: [], error: null }));

    expect((await getViewerPostEngagement(client as never, null, ["a"])).size).toBe(0);
    expect((await getViewerPostEngagement(client as never, "reader-1", [])).size).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it("treats an unavailable signal as no history", async () => {
    const client = rpcClient(() => ({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    }));

    const engagement = await getViewerPostEngagement(
      client as never,
      "reader-1",
      ["post-1"]
    );

    expect(engagement.size).toBe(0);
  });
});
