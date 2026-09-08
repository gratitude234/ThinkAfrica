import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the viewer's own state, against real PostgreSQL.
 *
 * Blocking is symmetric in one direction and not in the other, which is the
 * whole substance of these queries and the easiest thing to get backwards.
 * The fixtures make the asymmetry explicit rather than hoping production data
 * happens to contain a one-directional block.
 *
 * Read-only apart from transactions that are rolled back.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresViewerStateRepository } = await import(
  "@/lib/db/viewerState"
);
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";

vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(!enabled)("viewer state against PostgreSQL", () => {
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

  async function inRollback(
    body: (repository: ReturnType<typeof createPostgresViewerStateRepository>, executor: SqlExecutor) => Promise<void>
  ) {
    await sql
      .begin(async (tx) => {
        const executorTx = adaptDriver(tx as never);
        await body(createPostgresViewerStateRepository(executorTx), executorTx);
        throw new Error("rollback");
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error) || error.message !== "rollback") throw error;
      });
  }

  /** Two real members, so the foreign keys on user_blocks are satisfied. */
  async function twoMembers(executorTx: SqlExecutor) {
    return executorTx.query<{ id: string }>(
      `select id::text as id from public.profiles limit 2`
    );
  }

  it("returns only what the blocker blocked, not what was done to them", async () => {
    await inRollback(async (repository, executorTx) => {
      const [a, b] = await twoMembers(executorTx);
      if (!a || !b) return;

      await executorTx.query(
        `insert into public.user_blocks (blocker_id, blocked_id)
         values ($1::uuid, $2::uuid)
         on conflict do nothing`,
        [a.id, b.id]
      );

      expect(await repository.blockedUserIds(a.id)).toContain(b.id);

      // The blocked side must not learn about it here. This direction is the
      // one a naive symmetric query gets wrong.
      expect(await repository.blockedUserIds(b.id)).not.toContain(a.id);
    });
  });

  it("returns both directions for feed exclusion", async () => {
    await inRollback(async (repository, executorTx) => {
      const [a, b] = await twoMembers(executorTx);
      if (!a || !b) return;

      await executorTx.query(
        `insert into public.user_blocks (blocker_id, blocked_id)
         values ($1::uuid, $2::uuid)
         on conflict do nothing`,
        [a.id, b.id]
      );

      // Feed eligibility is symmetric on purpose: neither should surface in
      // the other's public browsing, whichever of them pressed the button.
      expect(await repository.blockRelatedUserIds(a.id)).toContain(b.id);
      expect(await repository.blockRelatedUserIds(b.id)).toContain(a.id);
    });
  });

  it("cannot put the viewer in their own exclusion list", async () => {
    // Two independent guarantees, asserted separately.
    //
    // The database refuses a self-block outright, so the row this filter
    // defends against cannot currently exist. That is checked from the
    // catalogue rather than by attempting the insert: a failed insert aborts
    // the surrounding transaction, and every later statement in it then fails
    // for an unrelated reason.
    const [constraint] = await executor.query<{ definition: string }>(
      `select pg_get_constraintdef(c.oid) as definition
       from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       where t.relname = 'user_blocks' and c.contype = 'c'
       limit 1`
    );
    expect(constraint?.definition ?? "").toMatch(/blocker_id <> blocked_id/);

    // And the query filters it anyway, so if the constraint were ever dropped
    // a self-block would not empty someone's feed of their own work.
    const repository = createPostgresViewerStateRepository(executor);
    const [member] = await executor.query<{ id: string }>(
      `select id::text as id from public.profiles limit 1`
    );
    if (!member) return;
    expect(await repository.blockRelatedUserIds(member.id)).not.toContain(
      member.id
    );
  });

  it("returns an empty list for someone who has blocked nobody", async () => {
    const repository = createPostgresViewerStateRepository(executor);
    expect(
      await repository.blockedUserIds("00000000-0000-0000-0000-000000000000")
    ).toEqual([]);
    expect(
      await repository.blockRelatedUserIds("00000000-0000-0000-0000-000000000000")
    ).toEqual([]);
  });

  it("finds posts credited to an excluded co-author, accepted only", async () => {
    const repository = createPostgresViewerStateRepository(executor);

    const [row] = await executor.query<{ post_id: string; user_id: string }>(
      `select a.post_id::text as post_id, a.user_id::text as user_id
       from public.post_authors a
       where a.accepted_at is not null limit 1`
    );
    if (!row) return;

    const found = await repository.postIdsWithAuthors([row.post_id], [row.user_id]);
    expect(found).toEqual([row.post_id]);

    const [pending] = await executor.query<{ post_id: string; user_id: string }>(
      `select a.post_id::text as post_id, a.user_id::text as user_id
       from public.post_authors a
       where a.accepted_at is null limit 1`
    );
    if (pending) {
      // An unaccepted invitation is not a credit, so it must not exclude the
      // post. Dropping the accepted_at filter would hide work nobody wrote.
      expect(
        await repository.postIdsWithAuthors([pending.post_id], [pending.user_id])
      ).toEqual([]);
    }
  });

  it("returns nothing when either list is empty, without going to the database", async () => {
    const repository = createPostgresViewerStateRepository({
      query: async () => {
        throw new Error("should not have been called");
      },
    });
    expect(await repository.postIdsWithAuthors([], ["x"])).toEqual([]);
    expect(await repository.postIdsWithAuthors(["x"], [])).toEqual([]);
  });

  it("reports a blocked pair in both directions, from one block", async () => {
    await inRollback(async (repository, executorTx) => {
      const [a, b] = await twoMembers(executorTx);
      if (!a || !b) return;

      expect(await repository.isBlockedPair(a.id, b.id)).toBe(false);

      await executorTx.query(
        `insert into public.user_blocks (blocker_id, blocked_id)
         values ($1::uuid, $2::uuid)
         on conflict do nothing`,
        [a.id, b.id]
      );

      // Messaging eligibility is symmetric: one block stops the conversation
      // whichever end asks. Blocking is never disclosed to the blocked side,
      // which is why the caller returns no reason.
      expect(await repository.isBlockedPair(a.id, b.id)).toBe(true);
      expect(await repository.isBlockedPair(b.id, a.id)).toBe(true);
    });
  });

  it("throws on a database failure rather than reporting no blocks", async () => {
    const broken = createPostgresViewerStateRepository({
      query: async () => {
        throw new Error("connection reset");
      },
    });

    // The soft-fail lives in lib/blocking.ts, behind an explicit `strict`
    // option, so the choice is visible at the call site rather than buried in
    // a repository that silently reports "nobody is blocked".
    await expect(
      broken.blockedUserIds("00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow("connection reset");
  });
});
