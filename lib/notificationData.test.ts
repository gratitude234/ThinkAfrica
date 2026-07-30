import { describe, expect, it } from "vitest";
import { fetchNotificationRows, fetchUnreadCount } from "./notificationData";

interface RecordedCall {
  method: string;
  args: unknown[];
}

/** Chainable stand-in for the Supabase query builder; records every filter. */
function createClient(result: { data?: unknown; count?: number; error?: unknown } = {}) {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};

  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  for (const method of ["select", "eq", "is", "not", "order", "limit"]) {
    builder[method] = chain(method);
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({
      data: result.data ?? [],
      count: result.count,
      error: result.error ?? null,
    }).then(resolve);

  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push({ method: "from", args: [table] });
        return builder as never;
      },
    },
  };
}

const notFilters = (calls: RecordedCall[]) =>
  calls.filter((call) => call.method === "not").map((call) => call.args);

describe("muted type filtering", () => {
  it("excludes muted types from the row query", async () => {
    const { client, calls } = createClient();

    await fetchNotificationRows(client, "u1", 50, ["like", "follow"]);

    expect(notFilters(calls)).toEqual([["type", "in", "(like,follow)"]]);
  });

  it("applies the same filter to the unread count", async () => {
    // If these two ever diverge the badge counts notifications the inbox will not
    // show, which is the bug the count query was introduced to fix.
    const { client, calls } = createClient({ count: 3 });

    await fetchUnreadCount(client, "u1", ["like", "follow"]);

    expect(notFilters(calls)).toEqual([["type", "in", "(like,follow)"]]);
  });

  it("adds no filter when nothing is muted", async () => {
    const rows = createClient();
    const counts = createClient({ count: 0 });

    await fetchNotificationRows(rows.client, "u1", 50, []);
    await fetchUnreadCount(counts.client, "u1", []);

    expect(notFilters(rows.calls)).toEqual([]);
    expect(notFilters(counts.calls)).toEqual([]);
  });

  it("defaults to muting nothing when the argument is omitted", async () => {
    const { client, calls } = createClient();

    await fetchNotificationRows(client, "u1");

    expect(notFilters(calls)).toEqual([]);
  });

  it("still excludes dismissed rows alongside muted types", async () => {
    const { client, calls } = createClient();

    await fetchNotificationRows(client, "u1", 50, ["like"]);

    expect(calls.filter((call) => call.method === "is").map((c) => c.args)).toEqual([
      ["dismissed_at", null],
    ]);
  });
});

describe("fetchUnreadCount", () => {
  it("reports a real count", async () => {
    const { client } = createClient({ count: 41 });
    await expect(fetchUnreadCount(client, "u1")).resolves.toEqual({
      count: 41,
      error: null,
    });
  });

  it("returns null rather than zero when the query fails", async () => {
    // Null means "unknown" so the caller can leave the previous badge alone.
    const { client } = createClient({ error: { message: "offline" } });

    await expect(fetchUnreadCount(client, "u1")).resolves.toEqual({
      count: null,
      error: "offline",
    });
  });
});
