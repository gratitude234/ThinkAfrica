import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The post page's PostgreSQL repository, against a real database.
 *
 * This proves the SQL: that the aggregates return the shapes the page
 * destructures, that ordering and null semantics match what PostgREST
 * produced, and that an absent child collection is an empty array rather than
 * null. It cannot prove agreement with PostgREST, which needs both to be
 * reachable at once; that is `postPage.parity.live.test.ts`.
 *
 * Runs against Neon scratch, which is a copy of production and therefore has
 * the same schema, the same constraints and real rows to read. Row *currency*
 * is irrelevant here: nothing below asserts a particular post exists, only
 * that the queries behave.
 *
 * Read-only apart from one transaction that is rolled back.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresPostPageRepository } = await import("@/lib/db/postPage");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { PostPageRepository } from "@/lib/db/postPage";

describe.skipIf(!enabled)("the post page repository against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: PostPageRepository;

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
    repository = createPostgresPostPageRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function anyPublishedPost() {
    const rows = await executor.query<{ id: string; published_at: string }>(
      `select id::text as id, published_at from public.posts
       where status = 'published' and published_at is not null
       order by published_at desc limit 1`
    );
    return rows[0];
  }

  it("returns four counts as numbers, never strings", async () => {
    const post = await anyPublishedPost();
    const counts = await repository.counts(post.id);

    // count(*) is int8 and arrives as a string from most drivers. A string
    // where the page expects a number renders "12" + 1 as "121".
    for (const [name, value] of Object.entries(counts)) {
      expect(typeof value, `${name} should be a number`).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);

  it("agrees with the equivalent individual counts", async () => {
    const post = await anyPublishedPost();
    const counts = await repository.counts(post.id);

    const [expected] = await executor.query<Record<string, unknown>>(
      `select
         (select count(*) from public.likes where post_id = $1::uuid) as l,
         (select count(*) from public.bookmarks where post_id = $1::uuid) as b,
         (select count(*) from public.comments where post_id = $1::uuid) as c,
         (select count(*) from public.posts
           where in_response_to = $1::uuid and status = 'published') as r`,
      [post.id]
    );

    expect(counts.likeCount).toBe(Number(expected.l));
    expect(counts.bookmarkCount).toBe(Number(expected.b));
    expect(counts.commentCount).toBe(Number(expected.c));
    expect(counts.responseCount).toBe(Number(expected.r));
  }, 60_000);

  it("returns every collection as an array, even when empty", async () => {
    // A post with no references, co-authors, reviews, decisions or versions.
    // jsonb_agg over no rows is NULL, and the page maps all five.
    const rows = await executor.query<{ id: string }>(
      `select p.id::text as id from public.posts as p
       where not exists (select 1 from public.post_references r where r.post_id = p.id)
         and not exists (select 1 from public.post_reviews v where v.post_id = p.id)
       limit 1`
    );
    if (rows.length === 0) return;

    const collections = await repository.collections(rows[0].id, null);
    for (const [name, value] of Object.entries(collections)) {
      expect(Array.isArray(value), `${name} should be an array`).toBe(true);
    }
    expect(collections.references).toEqual([]);
    expect(collections.reviews).toEqual([]);
  }, 60_000);

  it("orders references by display_order and carries every column", async () => {
    const rows = await executor.query<{ id: string }>(
      `select post_id::text as id from public.post_references
       group by post_id having count(*) > 1 limit 1`
    );
    if (rows.length === 0) return;

    const { references } = await repository.collections(rows[0].id, null);
    expect(references.length).toBeGreaterThan(1);

    const orders = references.map((entry) => entry.display_order ?? 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);

    // `select("*")` in PostgREST; `to_jsonb(r)` here. The page reads several
    // of these, so the whole row has to survive.
    for (const key of ["id", "post_id", "title", "display_order"]) {
      expect(references[0]).toHaveProperty(key);
    }
  }, 60_000);

  it("embeds the co-author profile as an object, not an array", async () => {
    const rows = await executor.query<{ id: string }>(
      `select post_id::text as id from public.post_authors
       where accepted_at is not null limit 1`
    );
    if (rows.length === 0) return;

    const { coAuthors } = await repository.collections(rows[0].id, null);
    expect(coAuthors.length).toBeGreaterThan(0);

    // PostgREST returns a one-to-one embed as an object or a one-element
    // array depending on how it resolved the relationship, and the page
    // normalises. This side must produce the object directly.
    const profile = coAuthors[0].profile;
    expect(Array.isArray(profile)).toBe(false);
    if (profile) expect(typeof profile.username).toBe("string");
  }, 60_000);

  it("excludes co-authors who have not accepted", async () => {
    const rows = await executor.query<{ id: string }>(
      `select post_id::text as id from public.post_authors
       where accepted_at is null limit 1`
    );
    if (rows.length === 0) return;

    const { coAuthors } = await repository.collections(rows[0].id, null);
    for (const entry of coAuthors) {
      expect(entry.accepted_at).not.toBeNull();
    }
  }, 60_000);

  it("excludes removed reviews", async () => {
    const rows = await executor.query<{ id: string }>(
      `select post_id::text as id from public.post_reviews
       where removed_at is not null limit 1`
    );
    if (rows.length === 0) return;

    const { reviews } = await repository.collections(rows[0].id, null);
    const [expected] = await executor.query<{ count: string }>(
      `select count(*)::int as count from public.post_reviews
       where post_id = $1::uuid and removed_at is null`,
      [rows[0].id]
    );
    expect(reviews.length).toBe(Number(expected.count));
  }, 60_000);

  it("finds related posts by tag overlap and never the post itself", async () => {
    const rows = await executor.query<{ id: string; tags: unknown }>(
      `select id::text as id, to_jsonb(tags) as tags from public.posts
       where status = 'published' and tags is not null
         and array_length(tags, 1) > 0
       limit 1`
    );
    if (rows.length === 0) return;

    const tags = (rows[0].tags as string[]) ?? [];
    const related = await repository.related(rows[0].id, tags, 3, null);

    expect(related.length).toBeLessThanOrEqual(3);
    for (const entry of related) {
      expect(entry.id).not.toBe(rows[0].id);
      // The array parameter survived the jsonb round trip, which is the
      // failure mode this whole driver configuration keeps producing.
      expect(typeof entry.slug).toBe("string");
    }
  }, 60_000);

  it("returns no related posts when the post has no tags", async () => {
    const post = await anyPublishedPost();
    expect(await repository.related(post.id, [], 3, null)).toEqual([]);
  }, 60_000);

  it("returns neighbours on the correct sides of the timestamp", async () => {
    const rows = await executor.query<{ id: string; published_at: string }>(
      `select id::text as id, published_at from public.posts
       where status = 'published' and published_at is not null
       order by published_at desc offset 3 limit 1`
    );
    if (rows.length === 0) return;

    const at = new Date(rows[0].published_at).toISOString();
    const { previous, next } = await repository.neighbours(rows[0].id, at);

    for (const [label, neighbour, comparison] of [
      ["previous", previous, "<"],
      ["next", next, ">"],
    ] as const) {
      if (!neighbour) continue;
      expect(neighbour.id).not.toBe(rows[0].id);
      const [check] = await executor.query<{ ok: boolean }>(
        `select (published_at ${comparison} $2::timestamptz) as ok
         from public.posts where id = $1::uuid`,
        [neighbour.id, at]
      );
      expect(check.ok, `${label} is on the wrong side`).toBe(true);
    }
  }, 60_000);

  it("returns a parent post only when it is published", async () => {
    const rows = await executor.query<{ id: string; status: string }>(
      `select id::text as id, status from public.posts
       where status <> 'published' limit 1`
    );
    if (rows.length > 0) {
      expect(await repository.parentPost(rows[0].id, null)).toBeNull();
    }

    const published = await anyPublishedPost();
    const parent = await repository.parentPost(published.id, null);
    expect(parent?.id).toBe(published.id);
    expect(Array.isArray(parent?.profiles)).toBe(false);
  }, 60_000);

  it("reports viewer state as booleans, and false for an unknown author", async () => {
    const post = await anyPublishedPost();
    const [profile] = await executor.query<{ id: string }>(
      "select id::text as id from public.profiles limit 1"
    );

    const state = await repository.viewerState(post.id, profile.id, null);
    for (const [name, value] of Object.entries(state)) {
      expect(typeof value, `${name} should be a boolean`).toBe("boolean");
    }
    // No author id means no relationship to have.
    expect(state.following).toBe(false);
    expect(state.subscribed).toBe(false);
  }, 60_000);

  it("reflects a like that exists, inside a rolled-back transaction", async () => {
    const post = await anyPublishedPost();
    const [profile] = await executor.query<{ id: string }>(
      "select id::text as id from public.profiles limit 1"
    );

    await sql
      .begin(async (tx) => {
        const txRepository = createPostgresPostPageRepository(
          adaptDriver(tx as never)
        );

        const before = await txRepository.viewerState(post.id, profile.id, null);

        await tx.unsafe(
          `insert into public.likes (post_id, user_id) values ($1::uuid, $2::uuid)
           on conflict do nothing`,
          [post.id, profile.id]
        );

        const after = await txRepository.viewerState(post.id, profile.id, null);
        expect(after.liked).toBe(true);
        void before;

        throw new Error("__rollback__");
      })
      .catch((error: Error) => {
        if (error.message !== "__rollback__") throw error;
      });
  }, 120_000);
});

describe.skipIf(enabled)("the post page repository against PostgreSQL", () => {
  it("is skipped without a PostgreSQL connection", () => {
    console.info("[postPage] skipped: DATABASE_URL is not a Neon connection string.");
    expect(enabled).toBe(false);
  });
});
