import { describe, expect, it } from "vitest";

import {
  createPostgresProfilePageRepository,
  createSupabaseProfilePageRepository,
} from "@/lib/db/profilePage";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

/**
 * The owner's Drafts tab, at the repository.
 *
 * RLS is what keeps a stranger's drafts out of a PostgREST answer. A direct
 * connection has no such policy, so on that path the repository's own owner
 * check and its `author_id` filter are the whole authorization. Both
 * implementations have to refuse a non-owner the same way: with no rows and
 * without asking the database.
 */

function recordingExecutor(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  const executor: SqlExecutor = {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      calls.push({ text, params });
      return rows as Row[];
    },
  };
  return { executor, calls };
}

function recordingClient(result: { data: unknown; error: unknown }) {
  const calls: Array<{ table: string; select?: string; eq: Array<[string, unknown]> }> = [];
  const client = {
    from(table: string) {
      const call = { table, select: undefined as string | undefined, eq: [] as Array<[string, unknown]> };
      calls.push(call);
      const chain: Record<string, unknown> = {
        select(columns: string) {
          call.select = columns;
          return chain;
        },
        eq(column: string, value: unknown) {
          call.eq.push([column, value]);
          return chain;
        },
        order: () => chain,
        then: (onOk: unknown, onErr: unknown) =>
          Promise.resolve(result).then(onOk as never, onErr as never),
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

describe("ownerDrafts, PostgreSQL", () => {
  it("runs no statement when the viewer is not the profile", async () => {
    const { executor, calls } = recordingExecutor([{ id: "leak" }]);
    const repository = createPostgresProfilePageRepository(executor);

    await expect(
      repository.ownerDrafts({ profileId: "author-1", viewerId: "reader-1" })
    ).resolves.toEqual([]);
    await expect(
      repository.ownerDrafts({ profileId: "author-1", viewerId: "" })
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it("selects only the owner's drafts, keyed on the viewer id", async () => {
    const { executor, calls } = recordingExecutor([
      {
        id: "draft-1",
        title: null,
        content_kind: "article",
        updated_at: new Date("2026-02-01T00:00:00Z"),
      },
    ]);
    const repository = createPostgresProfilePageRepository(executor);

    const drafts = await repository.ownerDrafts({
      profileId: "author-1",
      viewerId: "author-1",
    });

    expect(drafts).toEqual([
      {
        id: "draft-1",
        title: null,
        content_kind: "article",
        updated_at: "2026-02-01T00:00:00.000Z",
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual(["author-1"]);
    expect(calls[0]?.text).toMatch(/p\.author_id = \$1::uuid/);
    expect(calls[0]?.text).toMatch(/p\.status = 'draft'/);
  });
});

describe("ownerDrafts, Supabase", () => {
  it("issues no query when the viewer is not the profile", async () => {
    const { client, calls } = recordingClient({ data: [{ id: "leak" }], error: null });
    const repository = createSupabaseProfilePageRepository(client);

    await expect(
      repository.ownerDrafts({ profileId: "author-1", viewerId: "reader-1" })
    ).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });

  it("filters to the owner's own drafts", async () => {
    const { client, calls } = recordingClient({
      data: [{ id: "draft-1", title: "T", content_kind: "post", updated_at: "2026-02-01T00:00:00Z" }],
      error: null,
    });
    const repository = createSupabaseProfilePageRepository(client);

    const drafts = await repository.ownerDrafts({
      profileId: "author-1",
      viewerId: "author-1",
    });

    expect(drafts.map((draft) => draft.id)).toEqual(["draft-1"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("posts");
    expect(calls[0]?.eq).toEqual([
      ["author_id", "author-1"],
      ["status", "draft"],
    ]);
  });

  it("throws on a database error rather than answering no drafts", async () => {
    const { client } = recordingClient({ data: null, error: { message: "timeout" } });
    const repository = createSupabaseProfilePageRepository(client);

    await expect(
      repository.ownerDrafts({ profileId: "author-1", viewerId: "author-1" })
    ).rejects.toThrow(/drafts failed: timeout/);
  });
});
