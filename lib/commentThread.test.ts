import { describe, expect, it, vi } from "vitest";
import { fetchCommentPage } from "./commentThread";

vi.mock("./blocking", () => ({
  getBlockedUserIds: vi.fn().mockResolvedValue([]),
}));

interface QueryLog {
  orders: Array<{ column: string; ascending: boolean }>;
  or: string | null;
  lt: { column: string; value: string } | null;
}

/**
 * A PostgREST-shaped stub that records what the builder was asked for. The
 * ordering and the keyset predicate are the whole point of the sort, so they
 * are what gets asserted rather than the rows coming back.
 */
function stubClient(topLevelRows: unknown[]) {
  const log: QueryLog = { orders: [], or: null, lt: null };
  let call = 0;

  const from = () => {
    const isTopLevel = call++ === 0;
    const builder: Record<string, unknown> = {};
    const chain = () => builder;

    Object.assign(builder, {
      select: chain,
      eq: chain,
      is: chain,
      in: chain,
      limit: chain,
      order: (column: string, options?: { ascending?: boolean }) => {
        if (isTopLevel) {
          log.orders.push({ column, ascending: options?.ascending ?? true });
        }
        return builder;
      },
      or: (expression: string) => {
        log.or = expression;
        return builder;
      },
      lt: (column: string, value: string) => {
        log.lt = { column, value };
        return builder;
      },
      then: (resolve: (value: { data: unknown[] }) => unknown) =>
        resolve({ data: isTopLevel ? topLevelRows : [] }),
    });

    return builder;
  };

  return { client: { from } as never, log };
}

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "c1",
  content: "A thought.",
  created_at: "2026-08-10T09:00:00.000Z",
  updated_at: null,
  upvotes: 7,
  parent_id: null,
  author_id: "author-1",
  profiles: { username: "ada", full_name: "Ada Obi", avatar_url: null },
  ...over,
});

describe("fetchCommentPage", () => {
  it("orders by score first by default, with recency as the tiebreaker", async () => {
    const { client, log } = stubClient([row()]);

    await fetchCommentPage(client, { postId: "post-1", viewerId: null });

    expect(log.orders).toEqual([
      { column: "upvotes", ascending: false },
      { column: "created_at", ascending: false },
    ]);
  });

  it("orders by recency alone when asked for the newest", async () => {
    const { client, log } = stubClient([row()]);

    await fetchCommentPage(client, { postId: "post-1", viewerId: null, sort: "new" });

    expect(log.orders).toEqual([{ column: "created_at", ascending: false }]);
  });

  it("mints a score cursor under the top sort", async () => {
    const { client } = stubClient([
      row({ id: "c1", upvotes: 9 }),
      row({ id: "c2", upvotes: 3, created_at: "2026-08-09T09:00:00.000Z" }),
    ]);

    const page = await fetchCommentPage(client, { postId: "post-1", viewerId: null });

    expect(page.nextCursor).toBe("3|2026-08-09T09:00:00.000Z");
  });

  it("mints a plain timestamp cursor under the new sort", async () => {
    const { client } = stubClient([row({ created_at: "2026-08-09T09:00:00.000Z" })]);

    const page = await fetchCommentPage(client, {
      postId: "post-1",
      viewerId: null,
      sort: "new",
    });

    expect(page.nextCursor).toBe("2026-08-09T09:00:00.000Z");
  });

  it("pages the top sort on the score and the tiebreaker together", async () => {
    const { client, log } = stubClient([row()]);

    await fetchCommentPage(client, {
      postId: "post-1",
      viewerId: null,
      before: "3|2026-08-09T09:00:00.000Z",
    });

    // Without the tiebreaker in the predicate, every comment sharing a score
    // would repeat or vanish across the page boundary.
    expect(log.or).toBe(
      "upvotes.lt.3,and(upvotes.eq.3,created_at.lt.2026-08-09T09:00:00.000Z)"
    );
    expect(log.lt).toBeNull();
  });

  it("pages the new sort on the timestamp alone", async () => {
    const { client, log } = stubClient([row()]);

    await fetchCommentPage(client, {
      postId: "post-1",
      viewerId: null,
      sort: "new",
      before: "2026-08-09T09:00:00.000Z",
    });

    expect(log.lt).toEqual({
      column: "created_at",
      value: "2026-08-09T09:00:00.000Z",
    });
    expect(log.or).toBeNull();
  });

  it("falls back to a timestamp predicate when a top cursor carries no score", async () => {
    const { client, log } = stubClient([row()]);

    await fetchCommentPage(client, {
      postId: "post-1",
      viewerId: null,
      before: "2026-08-09T09:00:00.000Z",
    });

    expect(log.lt).toEqual({
      column: "created_at",
      value: "2026-08-09T09:00:00.000Z",
    });
    expect(log.or).toBeNull();
  });
});
