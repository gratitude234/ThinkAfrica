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

function selectedWorkClient(results: Array<{ data: unknown; error: { message: string } | null }>) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]>; kinds: string[][] }> = [];
  let index = 0;
  const client = {
    from(table: string) {
      const call = { table, eq: [] as Array<[string, unknown]>, kinds: [] as string[][] };
      calls.push(call);
      const result = results[index++] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq(column: string, value: unknown) { call.eq.push([column, value]); return chain; },
        in(_column: string, values: string[]) { call.kinds.push(values); return chain; },
        maybeSingle: () => Promise.resolve(result),
      };
      return chain;
    },
  };
  return { client: client as never, calls };
}

const work = {
  id: "post-1",
  author_id: "author-1",
  title: "A public argument",
  slug: "a-public-argument",
  excerpt: "An excerpt",
  content_kind: "article",
  created_at: "2026-09-01T00:00:00Z",
  published_at: "2026-09-01T00:00:00Z",
  cover_image_url: null,
  word_count: 900,
};

describe("selectedWork, PostgreSQL", () => {
  it("reads only position one and only the profile owner's published Posts/Articles", async () => {
    const { executor, calls } = recordingExecutor([work]);
    const repository = createPostgresProfilePageRepository(executor);
    await expect(repository.selectedWork("author-1")).resolves.toMatchObject({ id: "post-1" });
    expect(calls[0]?.params).toEqual(["author-1"]);
    expect(calls[0]?.text).toMatch(/selected\.position = 1/);
    expect(calls[0]?.text).toMatch(/p\.author_id = \$1::uuid/);
    expect(calls[0]?.text).toMatch(/p\.status = 'published'/);
    expect(calls[0]?.text).toMatch(/p\.content_kind in \('post', 'article'\)/);
  });
});

describe("selectedWork, Supabase", () => {
  it("resolves the position-one selection to a published work owned by the profile", async () => {
    const { client, calls } = selectedWorkClient([
      { data: { post_id: "post-1" }, error: null },
      { data: work, error: null },
    ]);
    const repository = createSupabaseProfilePageRepository(client);
    await expect(repository.selectedWork("author-1")).resolves.toMatchObject({ id: "post-1" });
    expect(calls[0]).toMatchObject({ table: "profile_featured_posts" });
    expect(calls[0]?.eq).toEqual([["user_id", "author-1"], ["position", 1]]);
    expect(calls[1]).toMatchObject({ table: "posts" });
    expect(calls[1]?.eq).toEqual([
      ["id", "post-1"],
      ["author_id", "author-1"],
      ["status", "published"],
    ]);
    expect(calls[1]?.kinds).toEqual([["post", "article"]]);
  });

  it("does not query posts when nothing is selected", async () => {
    const { client, calls } = selectedWorkClient([{ data: null, error: null }]);
    const repository = createSupabaseProfilePageRepository(client);
    await expect(repository.selectedWork("author-1")).resolves.toBeNull();
    expect(calls).toHaveLength(1);
  });
});
