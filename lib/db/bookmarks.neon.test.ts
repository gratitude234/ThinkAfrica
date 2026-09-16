import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the bookmarks list, against real PostgreSQL.
 *
 * This was the one migrated domain with no direct Neon coverage. The parity
 * harnesses compared it against Supabase Postgres and the authenticated
 * harness compared it against the policies, but neither of those runs against
 * the database that will actually serve it after cutover.
 *
 * What the query has to get right is not the list itself, which is a plain
 * `where user_id = $1` join. It is the two visibility rules the join carries:
 * a bookmark pointing at a post the reader may not see must not surface the
 * post, and an author whose profile is hidden must come back as a null
 * projection rather than removing the row. Those are the rules PostgREST used
 * to apply through RLS and the repository now applies in SQL, so they are what
 * the fixtures below exercise.
 *
 * Read-only: every case runs inside a transaction that is rolled back.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresBookmarksRepository } = await import("@/lib/db/bookmarks");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";

vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(!enabled)("the bookmarks list against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;

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
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function inRollback(
    body: (
      repository: ReturnType<typeof createPostgresBookmarksRepository>,
      executor: SqlExecutor
    ) => Promise<void>
  ) {
    await sql
      .begin(async (tx) => {
        const executorTx = adaptDriver(tx as never);
        await body(createPostgresBookmarksRepository(executorTx), executorTx);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback") throw error;
      });
  }

  /** A member and a published post by somebody else. */
  async function fixtures(executorTx: SqlExecutor) {
    const [reader] = await executorTx.query<{ id: string }>(
      `select id::text as id from public.profiles
        where suspended_at is null limit 1`
    );
    const [post] = await executorTx.query<{ id: string; author_id: string }>(
      `select id::text as id, author_id::text as author_id from public.posts
        where status = 'published' and author_id is not null limit 1`
    );
    return { reader, post };
  }

  it("returns an empty list for a member who has bookmarked nothing", async () => {
    await inRollback(async (repository, executorTx) => {
      const { reader } = await fixtures(executorTx);
      if (!reader) return;

      await executorTx.query(`delete from public.bookmarks where user_id = $1::uuid`, [
        reader.id,
      ]);

      // Empty, not everything. A predicate that degraded to true would return
      // the whole table here and every other assertion would still pass.
      expect(await repository.list(reader.id)).toEqual([]);
    });
  });

  it("returns a bookmarked published post, newest first", async () => {
    await inRollback(async (repository, executorTx) => {
      const { reader } = await fixtures(executorTx);
      if (!reader) return;

      const posts = await executorTx.query<{ id: string }>(
        `select id::text as id from public.posts
          where status = 'published' order by published_at desc nulls last limit 2`
      );
      if (posts.length < 2) return;

      await executorTx.query(`delete from public.bookmarks where user_id = $1::uuid`, [
        reader.id,
      ]);
      // Inserted oldest first, so a correct `order by created_at desc` has to
      // reverse them rather than preserving insertion order.
      await executorTx.query(
        `insert into public.bookmarks (user_id, post_id, created_at)
         values ($1::uuid, $2::uuid, now() - interval '1 hour'),
                ($1::uuid, $3::uuid, now())`,
        [reader.id, posts[0].id, posts[1].id]
      );

      const list = await repository.list(reader.id);
      expect(list.map((row) => row.id)).toEqual([posts[1].id, posts[0].id]);
    });
  });

  it("hides a bookmark whose post is not published", async () => {
    await inRollback(async (repository, executorTx) => {
      const { reader } = await fixtures(executorTx);
      if (!reader) return;

      const [draft] = await executorTx.query<{ id: string }>(
        `select id::text as id from public.posts where status = 'draft' limit 1`
      );
      if (!draft) return;

      await executorTx.query(`delete from public.bookmarks where user_id = $1::uuid`, [
        reader.id,
      ]);
      await executorTx.query(
        `insert into public.bookmarks (user_id, post_id) values ($1::uuid, $2::uuid)`,
        [reader.id, draft.id]
      );

      // The row exists in bookmarks. It must not reach the reader, because the
      // post behind it is not visible to them.
      const list = await repository.list(reader.id);
      expect(list.map((row) => row.id)).not.toContain(draft.id);
    });
  });

  it("keeps the row but nulls the author when the profile is hidden", async () => {
    await inRollback(async (repository, executorTx) => {
      const { reader, post } = await fixtures(executorTx);
      if (!reader || !post || post.author_id === reader.id) return;

      await executorTx.query(`delete from public.bookmarks where user_id = $1::uuid`, [
        reader.id,
      ]);
      await executorTx.query(
        `insert into public.bookmarks (user_id, post_id) values ($1::uuid, $2::uuid)`,
        [reader.id, post.id]
      );
      await executorTx.query(
        `update public.profiles set suspended_at = now() where id = $1::uuid`,
        [post.author_id]
      );

      const list = await repository.list(reader.id);
      const row = list.find((entry) => entry.id === post.id);

      // The bookmark survives a suspended author. Dropping the row instead
      // would silently shorten the reader's own list, which is the failure the
      // LEFT JOIN exists to avoid.
      expect(row, "the bookmark disappeared with its author").toBeTruthy();
      expect(row?.profiles).toBeNull();
    });
  });

  it("returns arrays, not nulls, for an empty co-author list", async () => {
    await inRollback(async (repository, executorTx) => {
      const { reader, post } = await fixtures(executorTx);
      if (!reader || !post) return;

      await executorTx.query(`delete from public.bookmarks where user_id = $1::uuid`, [
        reader.id,
      ]);
      await executorTx.query(`delete from public.post_authors where post_id = $1::uuid`, [
        post.id,
      ]);
      await executorTx.query(
        `insert into public.bookmarks (user_id, post_id) values ($1::uuid, $2::uuid)`,
        [reader.id, post.id]
      );

      const [row] = await repository.list(reader.id);
      if (!row) return;
      // jsonb_agg returns null over no rows, and the contract says array. A
      // caller doing .map() on this is the bug being prevented.
      expect(Array.isArray(row.post_authors)).toBe(true);
      expect(row.post_authors).toEqual([]);
    });
  });

  it("gives two members two different lists", async () => {
    await inRollback(async (repository, executorTx) => {
      const members = await executorTx.query<{ id: string }>(
        `select id::text as id from public.profiles where suspended_at is null limit 2`
      );
      const [post] = await executorTx.query<{ id: string }>(
        `select id::text as id from public.posts where status = 'published' limit 1`
      );
      if (members.length < 2 || !post) return;

      for (const member of members) {
        await executorTx.query(`delete from public.bookmarks where user_id = $1::uuid`, [
          member.id,
        ]);
      }
      await executorTx.query(
        `insert into public.bookmarks (user_id, post_id) values ($1::uuid, $2::uuid)`,
        [members[0].id, post.id]
      );

      // A repository that ignored its viewer argument would return the same
      // list twice, and every test above would still pass.
      expect((await repository.list(members[0].id)).map((r) => r.id)).toEqual([post.id]);
      expect(await repository.list(members[1].id)).toEqual([]);
    });
  });
});
