import { describe, expect, it } from "vitest";

import {
  createPostgresProfilePageRepository,
  createSupabaseProfilePageRepository,
} from "@/lib/db/profilePage";
import type { SqlExecutor } from "@/lib/db/postgres/executor";

function recordingExecutor(rows: Record<string, unknown>[]) {
  const calls: Array<{ text: string; params: readonly unknown[] }> = [];
  const executor: SqlExecutor = {
    async query<Row>(text: string, params: readonly unknown[] = []) {
      calls.push({ text, params });
      return rows as Row[];
    },
  };
  return { executor, calls };
}

function topicsClient(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  const calls: Array<{
    table: string;
    select?: string;
    eq: Array<[string, unknown]>;
    kinds: string[][];
    ranges: number[][];
  }> = [];
  let index = 0;

  const client = {
    from(table: string) {
      const call = {
        table,
        select: undefined as string | undefined,
        eq: [] as Array<[string, unknown]>,
        kinds: [] as string[][],
        ranges: [] as number[][],
      };
      calls.push(call);
      const result = pages[index++] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {
        select(columns: string) {
          call.select = columns;
          return chain;
        },
        eq(column: string, value: unknown) {
          call.eq.push([column, value]);
          return chain;
        },
        in(_column: string, values: string[]) {
          call.kinds.push(values);
          return chain;
        },
        order: () => chain,
        range(start: number, end: number) {
          call.ranges.push([start, end]);
          return Promise.resolve(result);
        },
      };
      return chain;
    },
  };

  return { client: client as never, calls };
}

describe("publicationTopics, PostgreSQL", () => {
  it("aggregates normalized topic keys from published Posts and Articles", async () => {
    const { executor, calls } = recordingExecutor([
      { topic_key: "politics & governance", publication_count: "5" },
      { topic_key: "education policy", publication_count: "3" },
    ]);
    const repository = createPostgresProfilePageRepository(executor);

    await expect(repository.publicationTopics({ profileId: "author-1", limit: 6 })).resolves.toEqual([
      { key: "politics & governance", count: 5 },
      { key: "education policy", count: 3 },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual(["author-1", 6]);
    expect(calls[0]?.text).toMatch(/topic_keys/);
    expect(calls[0]?.text).toMatch(/select distinct lower\(btrim\(input\.topic_key\)\)/);
    expect(calls[0]?.text).toMatch(/status = 'published'/);
    expect(calls[0]?.text).toMatch(/content_kind in \('article', 'post'\)/);
    expect(calls[0]?.text).toMatch(/order by publication_count desc/);
  });
});

describe("publicationTopics, Supabase", () => {
  it("counts each topic once per publication and ranks it by frequency then recency", async () => {
    const { client, calls } = topicsClient([
      {
        data: [
          {
            topic_keys: ["Politics & Governance", "politics & governance"],
            published_at: "2026-10-02T10:00:00Z",
            created_at: "2026-10-02T09:00:00Z",
          },
          {
            topic_keys: ["education policy", "Youth"],
            published_at: "2026-10-01T10:00:00Z",
            created_at: "2026-10-01T09:00:00Z",
          },
          {
            topic_keys: ["politics & governance", "education policy"],
            published_at: "2026-09-20T10:00:00Z",
            created_at: "2026-09-20T09:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const repository = createSupabaseProfilePageRepository(client);

    await expect(repository.publicationTopics({ profileId: "author-1", limit: 3 })).resolves.toEqual([
      { key: "politics & governance", count: 2 },
      { key: "education policy", count: 2 },
      { key: "youth", count: 1 },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("posts");
    expect(calls[0]?.select).toBe("topic_keys, published_at, created_at");
    expect(calls[0]?.eq).toEqual([
      ["author_id", "author-1"],
      ["status", "published"],
    ]);
    expect(calls[0]?.kinds).toEqual([["article", "post"]]);
    expect(calls[0]?.ranges).toEqual([[0, 499]]);
  });

  it("throws instead of silently showing partial writing topics", async () => {
    const { client } = topicsClient([{ data: null, error: { message: "timeout" } }]);
    const repository = createSupabaseProfilePageRepository(client);

    await expect(repository.publicationTopics({ profileId: "author-1", limit: 6 })).rejects.toThrow(
      /publication topics failed: timeout/
    );
  });
});
