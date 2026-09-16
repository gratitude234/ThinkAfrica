import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the dashboard and the bookmarks list, against real
 * PostgreSQL.
 *
 * The interesting assertions here are all about ownership. Every one of these
 * queries used to be protected by a policy scoped to `auth.uid()`, and the
 * failure mode of a bad port is not an error: it is one member's dashboard
 * showing another member's drafts, applications or reading list.
 *
 * Read-only apart from transactions that are rolled back.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresDashboardRepository } = await import("@/lib/db/dashboard");
const { createPostgresBookmarksRepository } = await import("@/lib/db/bookmarks");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { DashboardRepository } from "@/lib/db/dashboard";

vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(!enabled)("the dashboard against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: DashboardRepository;

  async function open() {
    const { default: postgres } = await import("postgres");
    return postgres(neonUrl!, {
      max: 1,
      prepare: false,
      connect_timeout: 20,
      fetch_types: false,
      onnotice: () => {},
    });
  }

  beforeAll(async () => {
    sql = await open();
    executor = adaptDriver(sql as never);
    repository = createPostgresDashboardRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function someAuthor() {
    const [row] = await executor.query<{ id: string }>(
      `select author_id::text as id from public.posts
       where author_id is not null
       group by author_id order by count(*) desc limit 1`
    );
    return row?.id ?? null;
  }

  // ── ownership ──────────────────────────────────────────────────────

  it("returns only this member's posts, drafts included", async () => {
    const author = await someAuthor();
    if (!author) return;

    const posts = await repository.myPosts(author);
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) expect(post.author_id).toBe(author);

    // The dashboard is where an author sees unpublished work, so a status
    // filter here would empty the drafts tab.
    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.posts where author_id = $1::uuid`,
      [author]
    );
    expect(posts.length).toBe(Number(n));
  });

  it("returns nothing for a member with no posts", async () => {
    expect(
      await repository.myPosts("00000000-0000-0000-0000-000000000000")
    ).toEqual([]);
  });

  // The research exclusion sentinel this used to exercise went with Phase 2I:
  // every row is a Post or an Article, and the database refuses anything else.
  it("returns only canonical content kinds", async () => {
    const author = await someAuthor();
    if (!author) return;

    const posts = await repository.myPosts(author);
    for (const post of posts) {
      expect(["post", "article"]).toContain(post.content_kind);
    }
  });

  it("orders newest first", async () => {
    const author = await someAuthor();
    if (!author) return;

    const posts = await repository.myPosts(author);
    for (let i = 1; i < posts.length; i += 1) {
      expect(Date.parse(posts[i].created_at)).toBeLessThanOrEqual(
        Date.parse(posts[i - 1].created_at)
      );
    }
  });

  it("returns the co-author collection as an array", async () => {
    const author = await someAuthor();
    if (!author) return;

    const posts = await repository.myPosts(author);
    for (const post of posts) {
      expect(Array.isArray(post.post_authors)).toBe(true);
      if (post.tags !== null) expect(Array.isArray(post.tags)).toBe(true);
    }
  });

  // ── the four stats ─────────────────────────────────────────────────

  it("returns the four stat buckets as numbers, keyed by post", async () => {
    const author = await someAuthor();
    if (!author) return;

    const posts = await repository.myPosts(author);
    const ids = posts.map((post) => post.id).slice(0, 10);
    if (ids.length === 0) return;

    const stats = await repository.postStats(ids, author);
    for (const bucket of [
      stats.referenceCounts,
      stats.bookmarkCounts,
      stats.likeCounts,
    ]) {
      for (const [postId, value] of Object.entries(bucket)) {
        expect(ids).toContain(postId);
        expect(typeof value).toBe("number");
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it("scopes the bookmark stat to the viewer, as the policy always did", async () => {
    const [row] = await executor.query<{ post_id: string; user_id: string }>(
      `select post_id::text as post_id, user_id::text as user_id
       from public.bookmarks limit 1`
    );
    if (!row) return;

    const mine = await repository.postStats([row.post_id], row.user_id);
    expect(mine.bookmarkCounts[row.post_id]).toBeGreaterThanOrEqual(1);

    // Somebody else's dashboard must not learn that this bookmark exists.
    // This is the reproduced quirk: the number is "my bookmarks", not "how
    // many people saved this".
    const theirs = await repository.postStats(
      [row.post_id],
      "00000000-0000-0000-0000-000000000000"
    );
    expect(theirs.bookmarkCounts[row.post_id]).toBeUndefined();
  });

  it("returns empty buckets for no posts, without going to the database", async () => {
    const broken = createPostgresDashboardRepository(
      {
        query: async () => {
          throw new Error("should not have been called");
        },
      }
    );
    const stats = await broken.postStats([], "00000000-0000-0000-0000-000000000000");
    expect(stats).toEqual({
      referenceCounts: {},
      bookmarkCounts: {},
      likeCounts: {},
    });
  });

  it("throws on a database failure rather than reporting an empty dashboard", async () => {
    const broken = createPostgresDashboardRepository(
      {
        query: async () => {
          throw new Error("connection reset");
        },
      }
    );
    await expect(
      broken.myPosts("00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow("connection reset");
  });
});

describe.skipIf(!enabled)("the bookmarks list against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;

  async function open() {
    const { default: postgres } = await import("postgres");
    return postgres(neonUrl!, {
      max: 1,
      prepare: false,
      connect_timeout: 20,
      fetch_types: false,
      onnotice: () => {},
    });
  }

  beforeAll(async () => {
    sql = await open();
    executor = adaptDriver(sql as never);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("returns one member's saved posts and nobody else's", async () => {
    const repository = createPostgresBookmarksRepository(executor);
    const [row] = await executor.query<{ user_id: string }>(
      `select user_id::text as user_id from public.bookmarks
       group by user_id order by count(*) desc limit 1`
    );
    if (!row) return;

    const posts = await repository.list(row.user_id);
    expect(posts.length).toBeGreaterThan(0);

    const ids = posts.map((post) => post.id);
    const foreign = await executor.query<{ id: string }>(
      `select p.id::text as id from public.posts p
       where p.id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         and not exists (
           select 1 from public.bookmarks b
           where b.post_id = p.id and b.user_id = $2::uuid
         )`,
      [JSON.stringify(ids), row.user_id]
    );

    // Ownership is now a WHERE clause rather than a policy. If it were
    // dropped, this is the assertion that fails: every returned post must be
    // one this member actually saved.
    expect(foreign).toEqual([]);
  });

  it("returns nothing for a member who has saved nothing", async () => {
    const repository = createPostgresBookmarksRepository(executor);
    expect(
      await repository.list("00000000-0000-0000-0000-000000000000")
    ).toEqual([]);
  });

  it("returns arrays for tags and co-authors, and an object for the author", async () => {
    const repository = createPostgresBookmarksRepository(executor);
    const [row] = await executor.query<{ user_id: string }>(
      `select user_id::text as user_id from public.bookmarks limit 1`
    );
    if (!row) return;

    for (const post of await repository.list(row.user_id)) {
      expect(Array.isArray(post.post_authors)).toBe(true);
      if (post.tags !== null) expect(Array.isArray(post.tags)).toBe(true);
      if (post.profiles !== null) expect(Array.isArray(post.profiles)).toBe(false);
    }
  });
});
