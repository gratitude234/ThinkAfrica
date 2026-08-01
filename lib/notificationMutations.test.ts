import { describe, expect, it } from "vitest";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationsRead,
  restoreUnread,
  undismissNotification,
} from "./notificationMutations";

interface RecordedCall {
  method: string;
  args: unknown[];
}

/**
 * Minimal stand-in for the Supabase query builder: every filter method records the
 * call and returns `this`, and awaiting the chain resolves to the configured
 * result. Enough to assert exactly which filters a mutation applied.
 */
function createClient(result: { data?: unknown; error?: unknown } = {}) {
  const calls: RecordedCall[] = [];

  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  for (const method of ["update", "eq", "in", "is", "select"]) {
    builder[method] = chain(method);
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(
      resolve
    );

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

function argsFor(calls: RecordedCall[], method: string) {
  return calls.filter((call) => call.method === method).map((call) => call.args);
}

describe("markNotificationsRead", () => {
  it("scopes the update to the owner, the given ids, and unread rows", async () => {
    const { client, calls } = createClient();

    const result = await markNotificationsRead(client, "user-1", ["n1", "n2"]);

    expect(result.error).toBeNull();
    expect(argsFor(calls, "update")).toEqual([[{ read: true }]]);
    expect(argsFor(calls, "eq")).toEqual([
      ["user_id", "user-1"],
      ["read", false],
    ]);
    expect(argsFor(calls, "in")).toEqual([["id", ["n1", "n2"]]]);
  });

  it("does not touch the database for an empty id list", async () => {
    const { client, calls } = createClient();

    const result = await markNotificationsRead(client, "user-1", []);

    expect(result.error).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("surfaces the error message rather than reporting success", async () => {
    const { client } = createClient({ error: { message: "denied" } });

    await expect(
      markNotificationsRead(client, "user-1", ["n1"])
    ).resolves.toEqual({ error: "denied" });
  });
});

describe("markAllNotificationsRead", () => {
  it("returns the ids it changed so the caller can offer an undo", async () => {
    const { client, calls } = createClient({
      data: [{ id: "n1" }, { id: "n2" }],
    });

    const result = await markAllNotificationsRead(client, "user-1");

    expect(result).toEqual({ error: null, affectedIds: ["n1", "n2"] });
    // Rows that were already read must stay out of the undo set, and dismissed
    // rows must not be resurrected by a bulk mark-read.
    expect(argsFor(calls, "eq")).toEqual([
      ["user_id", "user-1"],
      ["read", false],
    ]);
    expect(argsFor(calls, "is")).toEqual([["dismissed_at", null]]);
  });

  it("reports no affected ids when the update fails", async () => {
    const { client } = createClient({ error: { message: "offline" } });

    const result = await markAllNotificationsRead(client, "user-1");

    expect(result.error).toBe("offline");
    expect(result.affectedIds).toEqual([]);
  });
});

describe("restoreUnread", () => {
  it("restores the given rows to unread", async () => {
    const { client, calls } = createClient();

    const result = await restoreUnread(client, "user-1", ["n1"]);

    expect(result).toEqual({ error: null, conflict: false });
    expect(argsFor(calls, "update")).toEqual([[{ read: false }]]);
    expect(argsFor(calls, "in")).toEqual([["id", ["n1"]]]);
  });

  it("flags a unique violation so the caller can explain it", async () => {
    // uniq_unread_like_notification permits one unread like per (user, actor, post),
    // so re-liking after a mark-all-read makes the old row un-restorable.
    const { client } = createClient({
      error: { message: "duplicate key", code: "23505" },
    });

    const result = await restoreUnread(client, "user-1", ["n1"]);

    expect(result.conflict).toBe(true);
    expect(result.error).toBe("duplicate key");
  });

  it("does not treat other failures as conflicts", async () => {
    const { client } = createClient({
      error: { message: "offline", code: "08006" },
    });

    await expect(restoreUnread(client, "user-1", ["n1"])).resolves.toMatchObject({
      conflict: false,
    });
  });
});

describe("dismissNotification", () => {
  it("soft-deletes and marks read in one write", async () => {
    const { client, calls } = createClient();

    const result = await dismissNotification(client, "user-1", "n1");

    expect(result.error).toBeNull();

    const [[payload]] = argsFor(calls, "update") as Array<
      [{ dismissed_at: string; read: boolean }]
    >;
    // Marking read matters: a dismissed-but-unread row would keep counting in the
    // bell badge, which is the confusion dismissal exists to remove.
    expect(payload.read).toBe(true);
    expect(Number.isNaN(Date.parse(payload.dismissed_at))).toBe(false);

    expect(argsFor(calls, "eq")).toEqual([
      ["user_id", "user-1"],
      ["id", "n1"],
    ]);
  });
});

describe("undismissNotification", () => {
  it("clears dismissed_at without unreading the row", async () => {
    const { client, calls } = createClient();

    await undismissNotification(client, "user-1", "n1");

    expect(argsFor(calls, "update")).toEqual([[{ dismissed_at: null }]]);
  });
});
