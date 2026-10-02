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

function countClient(results: Array<{ count: number | null; error: { message: string } | null }>) {
  const calls: Array<{
    table: string;
    select?: string;
    options?: unknown;
    eq: Array<[string, unknown]>;
  }> = [];
  let index = 0;

  const client = {
    from(table: string) {
      const call = {
        table,
        select: undefined as string | undefined,
        options: undefined as unknown,
        eq: [] as Array<[string, unknown]>,
      };
      calls.push(call);
      const result = results[index++] ?? { count: 0, error: null };
      const chain: Record<string, unknown> = {
        select(columns: string, options?: unknown) {
          call.select = columns;
          call.options = options;
          return chain;
        },
        eq(column: string, value: unknown) {
          call.eq.push([column, value]);
          return chain;
        },
        then: (onOk: unknown, onErr: unknown) =>
          Promise.resolve({ data: null, ...result }).then(onOk as never, onErr as never),
      };
      return chain;
    },
  };

  return { client: client as never, calls };
}

describe("publicationCounts, PostgreSQL", () => {
  it("returns Post and Article totals as numbers from one bounded aggregate", async () => {
    const { executor, calls } = recordingExecutor([
      { article_count: "12", post_count: "31" },
    ]);
    const repository = createPostgresProfilePageRepository(executor);

    await expect(repository.publicationCounts("author-1")).resolves.toEqual({
      articleCount: 12,
      postCount: 31,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.params).toEqual(["author-1"]);
    expect(calls[0]?.text).toMatch(/status = 'published'/);
    expect(calls[0]?.text).toMatch(/content_kind = 'article'/);
    expect(calls[0]?.text).toMatch(/content_kind = 'post'/);
  });
});

describe("publicationCounts, Supabase", () => {
  it("uses exact head counts and the same publication truth as the profile lists", async () => {
    const { client, calls } = countClient([
      { count: 12, error: null },
      { count: 31, error: null },
    ]);
    const repository = createSupabaseProfilePageRepository(client);

    await expect(repository.publicationCounts("author-1")).resolves.toEqual({
      articleCount: 12,
      postCount: 31,
    });

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.table === "posts")).toBe(true);
    expect(calls.every((call) => call.select === "id")).toBe(true);
    expect(calls.every((call) => call.options && (call.options as { count?: string }).count === "exact")).toBe(true);
    expect(calls.every((call) => call.options && (call.options as { head?: boolean }).head === true)).toBe(true);
    expect(calls[0]?.eq).toEqual([
      ["author_id", "author-1"],
      ["status", "published"],
      ["content_kind", "article"],
    ]);
    expect(calls[1]?.eq).toEqual([
      ["author_id", "author-1"],
      ["status", "published"],
      ["content_kind", "post"],
    ]);
  });

  it("throws instead of silently turning a failed count into zero", async () => {
    const { client } = countClient([
      { count: null, error: { message: "timeout" } },
      { count: 31, error: null },
    ]);
    const repository = createSupabaseProfilePageRepository(client);

    await expect(repository.publicationCounts("author-1")).rejects.toThrow(
      /article count failed: timeout/
    );
  });
});
