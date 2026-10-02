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

function activityClient(pages: Array<{ data: unknown[] | null; error: { message: string } | null }>) {
  const calls: Array<{
    table: string;
    select?: string;
    eq: Array<[string, unknown]>;
    kinds: string[][];
    or: string[];
    ranges: number[][];
  }> = [];
  let index = 0;

  const client = {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "function absent" } }),
    from(table: string) {
      const call = {
        table,
        select: undefined as string | undefined,
        eq: [] as Array<[string, unknown]>,
        kinds: [] as string[][],
        or: [] as string[],
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
        or(filter: string) {
          call.or.push(filter);
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

describe("publicationActivity, PostgreSQL", () => {
  it("returns ordered UTC month buckets from one aggregate query", async () => {
    const { executor, calls } = recordingExecutor([
      { month: "2026-08", publication_count: "2" },
      { month: "2026-09", publication_count: "5" },
      { month: "2026-10", publication_count: "1" },
    ]);
    const repository = createPostgresProfilePageRepository(executor);

    await expect(
      repository.publicationActivity({
        profileId: "author-1",
        startMonth: "2026-08-01T00:00:00.000Z",
        months: 3,
      })
    ).resolves.toEqual([
      { month: "2026-08", count: 2 },
      { month: "2026-09", count: 5 },
      { month: "2026-10", count: 1 },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual([
      "author-1",
      "2026-08-01T00:00:00.000Z",
      3,
    ]);
    expect(calls[0]?.text).toMatch(/generate_series/);
    expect(calls[0]?.text).toMatch(/status = 'published'/);
    expect(calls[0]?.text).toMatch(/content_kind in \('article', 'post'\)/);
    expect(calls[0]?.text).toMatch(/coalesce\(p\.published_at, p\.created_at\)/);
  });
});

describe("publicationActivity, Supabase", () => {
  it("reads only publication timestamps in the window and aggregates them into month buckets", async () => {
    const { client, calls } = activityClient([
      {
        data: [
          { published_at: "2026-08-03T10:00:00Z", created_at: "2026-08-03T10:00:00Z" },
          { published_at: "2026-08-24T10:00:00Z", created_at: "2026-08-24T10:00:00Z" },
          { published_at: "2026-09-14T10:00:00Z", created_at: "2026-09-14T10:00:00Z" },
          { published_at: null, created_at: "2026-10-01T10:00:00Z" },
        ],
        error: null,
      },
    ]);
    const repository = createSupabaseProfilePageRepository(client);

    await expect(
      repository.publicationActivity({
        profileId: "author-1",
        startMonth: "2026-08-01T00:00:00.000Z",
        months: 3,
      })
    ).resolves.toEqual([
      { month: "2026-08", count: 2 },
      { month: "2026-09", count: 1 },
      { month: "2026-10", count: 1 },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("posts");
    expect(calls[0]?.select).toBe("published_at, created_at");
    expect(calls[0]?.eq).toEqual([
      ["author_id", "author-1"],
      ["status", "published"],
    ]);
    expect(calls[0]?.kinds).toEqual([["article", "post"]]);
    expect(calls[0]?.or).toHaveLength(1);
    expect(calls[0]?.or[0]).toMatch(/published_at\.gte\./);
    expect(calls[0]?.or[0]).toMatch(/published_at\.is\.null/);
    expect(calls[0]?.or[0]).toMatch(/created_at\.gte\./);
    expect(calls[0]?.ranges).toEqual([[0, 499]]);
  });

  it("throws rather than drawing an incomplete timeline when the timestamp read fails", async () => {
    const { client } = activityClient([{ data: null, error: { message: "timeout" } }]);
    const repository = createSupabaseProfilePageRepository(client);

    await expect(
      repository.publicationActivity({
        profileId: "author-1",
        startMonth: "2026-09-01T00:00:00.000Z",
        months: 2,
      })
    ).rejects.toThrow(/publication activity failed: timeout/);
  });
});
