import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the comment thread, against real PostgreSQL.
 *
 * The moderation rule gets fixtures rather than production rows, because a
 * hidden comment is not something the database can be relied on to contain and
 * "no such row" is exactly the shape a broken visibility check has. Fixtures
 * are built inside a transaction and rolled back.
 *
 * Read-only apart from those transactions.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresCommentsRepository } = await import("@/lib/db/comments");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { CommentsRepository } from "@/lib/db/comments";

vi.setConfig({ testTimeout: 60_000 });

const BASE = {
  viewerId: null as string | null,
  sort: "new" as const,
  cursorCreatedAt: null as string | null,
  cursorUpvotes: null as number | null,
  limit: 20,
};

describe.skipIf(!enabled)("the comment thread against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: CommentsRepository;

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
    repository = createPostgresCommentsRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function inRollback(body: (tx: unknown) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        await body(tx);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback") throw error;
      });
  }

  /** A post that actually has top-level comments. */
  async function commentedPost() {
    const [row] = await executor.query<{ post_id: string }>(
      `select c.post_id::text as post_id
       from public.comments c
       where c.parent_id is null and c.hidden_at is null
       group by c.post_id order by count(*) desc limit 1`
    );
    return row?.post_id ?? null;
  }

  // ── shape and ordering ─────────────────────────────────────────────

  it("returns top-level comments only", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const rows = await repository.topLevel({ ...BASE, postId });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.parent_id).toBeNull();
  });

  it("orders newest first under the new sort", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const rows = await repository.topLevel({ ...BASE, postId });
    for (let i = 1; i < rows.length; i += 1) {
      expect(Date.parse(rows[i].created_at)).toBeLessThanOrEqual(
        Date.parse(rows[i - 1].created_at)
      );
    }
  });

  it("orders by score then recency under the top sort", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const rows = await repository.topLevel({ ...BASE, postId, sort: "top" });
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      expect(current.upvotes).toBeLessThanOrEqual(previous.upvotes);
      if (current.upvotes === previous.upvotes) {
        expect(Date.parse(current.created_at)).toBeLessThanOrEqual(
          Date.parse(previous.created_at)
        );
      }
    }
  });

  it("gives the author projection as an object, or null", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const rows = await repository.topLevel({ ...BASE, postId });
    for (const row of rows) {
      if (row.profiles === null) continue;
      expect(Array.isArray(row.profiles)).toBe(false);
      expect(Object.keys(row.profiles as object).sort()).toEqual([
        "avatar_url",
        "full_name",
        "username",
      ]);
    }
  });

  // ── the keyset cursor ──────────────────────────────────────────────

  it("pages without repeating a comment, under the new sort", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const first = await repository.topLevel({ ...BASE, postId, limit: 3 });
    if (first.length < 3) return;

    const last = first[first.length - 1];
    const second = await repository.topLevel({
      ...BASE,
      postId,
      limit: 3,
      cursorCreatedAt: last.created_at,
    });

    const overlap = second.filter((row) =>
      first.some((other) => other.id === row.id)
    );
    expect(overlap).toEqual([]);
  });

  it("pages on the pair under the top sort, so a tied score neither repeats nor vanishes", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const first = await repository.topLevel({
      ...BASE,
      postId,
      sort: "top",
      limit: 3,
    });
    if (first.length < 3) return;

    const last = first[first.length - 1];
    const second = await repository.topLevel({
      ...BASE,
      postId,
      sort: "top",
      limit: 20,
      cursorCreatedAt: last.created_at,
      cursorUpvotes: last.upvotes,
    });

    expect(second.filter((row) => first.some((o) => o.id === row.id))).toEqual([]);

    // And nothing between the two pages went missing: every comment ranked
    // below the cursor is in the second page.
    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.comments c
       where c.post_id = $1::uuid and c.parent_id is null
         and c.hidden_at is null
         and (c.upvotes, c.created_at) < ($2::int, $3::timestamptz)`,
      [postId, last.upvotes, last.created_at]
    );
    expect(second.length).toBe(Math.min(Number(n), 20));
  });

  it("returns the first page when there is no cursor", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const withoutCursor = await repository.topLevel({ ...BASE, postId, limit: 2 });
    // A null cursor must admit everything. A predicate that compared against
    // null would return nothing and look like an empty thread.
    expect(withoutCursor.length).toBeGreaterThan(0);
  });

  // ── replies ────────────────────────────────────────────────────────

  it("returns replies oldest first, and only for the given parents", async () => {
    const [parent] = await executor.query<{ id: string }>(
      `select c.parent_id::text as id from public.comments c
       where c.parent_id is not null and c.hidden_at is null
       group by c.parent_id having count(*) > 1 limit 1`
    );
    if (!parent) return;

    const replies = await repository.replies([parent.id], null);
    expect(replies.length).toBeGreaterThan(1);
    for (const reply of replies) expect(reply.parent_id).toBe(parent.id);
    for (let i = 1; i < replies.length; i += 1) {
      expect(Date.parse(replies[i].created_at)).toBeGreaterThanOrEqual(
        Date.parse(replies[i - 1].created_at)
      );
    }
  });

  it("returns nothing for no parents, without going to the database", async () => {
    expect(await repository.replies([], null)).toEqual([]);
  });

  // ── moderation visibility ──────────────────────────────────────────

  it("hides a moderated comment from a logged-out reader", async () => {
    await inRollback(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresCommentsRepository(executorTx);

      const [row] = await executorTx.query<{ id: string; post_id: string }>(
        `select c.id::text as id, c.post_id::text as post_id
         from public.comments c
         where c.parent_id is null and c.hidden_at is null limit 1`
      );
      if (!row) return;

      await executorTx.query(
        `update public.comments set hidden_at = now() where id = $1::uuid`,
        [row.id]
      );

      const visible = await repositoryTx.topLevel({
        ...BASE,
        postId: row.post_id,
        limit: 100,
      });
      expect(visible.map((comment) => comment.id)).not.toContain(row.id);
    });
  });

  it("shows a moderated comment to its own author", async () => {
    await inRollback(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresCommentsRepository(executorTx);

      const [row] = await executorTx.query<{
        id: string;
        post_id: string;
        author_id: string;
      }>(
        `select c.id::text as id, c.post_id::text as post_id,
                c.author_id::text as author_id
         from public.comments c
         where c.parent_id is null and c.hidden_at is null limit 1`
      );
      if (!row) return;

      await executorTx.query(
        `update public.comments set hidden_at = now() where id = $1::uuid`,
        [row.id]
      );

      const asAuthor = await repositoryTx.topLevel({
        ...BASE,
        postId: row.post_id,
        viewerId: row.author_id,
        limit: 100,
      });
      expect(asAuthor.map((comment) => comment.id)).toContain(row.id);
    });
  });

  it("shows a moderated comment to an admin, and not to an ordinary member", async () => {
    await inRollback(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresCommentsRepository(executorTx);

      const [row] = await executorTx.query<{ id: string; post_id: string }>(
        `select c.id::text as id, c.post_id::text as post_id
         from public.comments c
         where c.parent_id is null and c.hidden_at is null limit 1`
      );
      if (!row) return;

      await executorTx.query(
        `update public.comments set hidden_at = now() where id = $1::uuid`,
        [row.id]
      );

      const [admin] = await executorTx.query<{ id: string }>(
        `select id::text as id from public.profiles where role = 'admin' limit 1`
      );
      const [member] = await executorTx.query<{ id: string }>(
        `select id::text as id from public.profiles
         where role is distinct from 'admin' and id <> (
           select author_id from public.comments where id = $1::uuid
         ) limit 1`,
        [row.id]
      );

      if (member) {
        const asMember = await repositoryTx.topLevel({
          ...BASE,
          postId: row.post_id,
          viewerId: member.id,
          limit: 100,
        });
        expect(asMember.map((comment) => comment.id)).not.toContain(row.id);
      }

      if (admin) {
        const asAdmin = await repositoryTx.topLevel({
          ...BASE,
          postId: row.post_id,
          viewerId: admin.id,
          limit: 100,
        });
        expect(asAdmin.map((comment) => comment.id)).toContain(row.id);
      }
    });
  });

  it("applies the same rule to replies", async () => {
    await inRollback(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresCommentsRepository(executorTx);

      const [row] = await executorTx.query<{ id: string; parent_id: string }>(
        `select c.id::text as id, c.parent_id::text as parent_id
         from public.comments c
         where c.parent_id is not null and c.hidden_at is null limit 1`
      );
      if (!row) return;

      await executorTx.query(
        `update public.comments set hidden_at = now() where id = $1::uuid`,
        [row.id]
      );

      const replies = await repositoryTx.replies([row.parent_id], null);
      expect(replies.map((reply) => reply.id)).not.toContain(row.id);
    });
  });

  it("nulls a suspended commenter's name without removing the comment", async () => {
    await inRollback(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresCommentsRepository(executorTx);

      const [row] = await executorTx.query<{
        id: string;
        post_id: string;
        author_id: string;
      }>(
        `select c.id::text as id, c.post_id::text as post_id,
                c.author_id::text as author_id
         from public.comments c
         join public.profiles p on p.id = c.author_id
         where c.parent_id is null and c.hidden_at is null limit 1`
      );
      if (!row) return;

      await executorTx.query(
        `update public.profiles set suspended_at = now() where id = $1::uuid`,
        [row.author_id]
      );

      const rows = await repositoryTx.topLevel({
        ...BASE,
        postId: row.post_id,
        limit: 100,
      });
      const found = rows.find((comment) => comment.id === row.id);

      // The comment stays, the name goes. Removing the row would change the
      // thread's shape because someone's account was suspended.
      expect(found).toBeDefined();
      expect(found!.profiles).toBeNull();
    });
  });

  // ── counts and votes ───────────────────────────────────────────────

  it("counts every visible comment, replies included, as a number", async () => {
    const postId = await commentedPost();
    if (!postId) return;

    const total = await repository.count(postId, null);
    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.comments c
       where c.post_id = $1::uuid and c.hidden_at is null`,
      [postId]
    );

    expect(typeof total).toBe("number");
    expect(total).toBe(Number(n));
  });

  it("excludes a moderated comment from the count", async () => {
    await inRollback(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresCommentsRepository(executorTx);

      const [row] = await executorTx.query<{ id: string; post_id: string }>(
        `select c.id::text as id, c.post_id::text as post_id
         from public.comments c where c.hidden_at is null limit 1`
      );
      if (!row) return;

      const before = await repositoryTx.count(row.post_id, null);
      await executorTx.query(
        `update public.comments set hidden_at = now() where id = $1::uuid`,
        [row.id]
      );
      const after = await repositoryTx.count(row.post_id, null);

      expect(after).toBe(before - 1);
    });
  });

  it("returns the viewer's votes, and nothing else", async () => {
    const [vote] = await executor.query<{ comment_id: string; user_id: string }>(
      `select comment_id::text as comment_id, user_id::text as user_id
       from public.comment_votes limit 1`
    );
    if (!vote) return;

    const mine = await repository.votedCommentIds([vote.comment_id], vote.user_id);
    expect(mine).toEqual([vote.comment_id]);

    const notMine = await repository.votedCommentIds(
      [vote.comment_id],
      "00000000-0000-0000-0000-000000000000"
    );
    expect(notMine).toEqual([]);
  });

  it("returns no votes for no comments, without going to the database", async () => {
    expect(
      await repository.votedCommentIds([], "00000000-0000-0000-0000-000000000000")
    ).toEqual([]);
  });

  // ── failure behaviour ──────────────────────────────────────────────

  it("throws on a database failure rather than reporting an empty thread", async () => {
    const broken = createPostgresCommentsRepository({
      query: async () => {
        throw new Error("connection reset");
      },
    });

    await expect(
      broken.topLevel({ ...BASE, postId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow("connection reset");
    await expect(
      broken.count("00000000-0000-0000-0000-000000000000", null)
    ).rejects.toThrow("connection reset");
  });
});
