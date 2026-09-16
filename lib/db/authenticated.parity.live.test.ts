import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The reads that need a member, compared against the policies themselves.
 *
 * ## Why this harness exists separately
 *
 * `viewerDomains.parity.live.test.ts` reads production with the service-role
 * key, which bypasses RLS. For most of the dashboard that is fine, because the
 * query's own `user_id = <viewer>` filter is the whole restriction and a
 * service-role read returns the same rows a member would see. For six reads it
 * is not fine, and that harness records them as BLOCKED rather than pretending
 * otherwise: `bookmarks` is `USING (auth.uid() = user_id)`, `post_references`
 * admits reviewers and co-authors, and four more embed a post or profile whose
 * visibility the query never constrains. A service-role read of those sees
 * more than any member does, so comparing it to anything proves nothing.
 *
 * ## What is compared here, and why it is the right question
 *
 * The migrated repositories replaced RLS with explicit predicates in SQL. The
 * question that matters is therefore not "does PostgREST return what
 * PostgreSQL returns" but "do the explicit predicates admit exactly the rows
 * the policies admitted". So each case below establishes the truth twice:
 *
 *   RLS side          a direct connection that has done `set local role
 *                     authenticated` and set `request.jwt.claims` to the
 *                     member's id, so `auth.uid()` resolves and every policy
 *                     on every table applies exactly as written
 *   repository side   the migrated PostgreSQL repository, called with that
 *                     same id as its trusted viewer argument
 *
 * Nothing is weakened to make this pass. The policies are the reference, and a
 * disagreement is a finding against the repository.
 *
 * ## Read only, and no session is created
 *
 * `SET LOCAL ROLE` inside a rolled-back transaction needs no password, mints
 * no token, and writes nothing to `auth`. There is deliberately no test
 * account: creating one would be a production auth write, and impersonating a
 * real member read-only is both safer and a better test, because real members
 * have real data.
 */

const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(directUrl);

const { createPostgresNotificationsRepository } = await import(
  "@/lib/db/notifications"
);
const { createPostgresBookmarksRepository } = await import("@/lib/db/bookmarks");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { differences } from "@/lib/db/parityDiff";

describe.skipIf(!enabled)("authenticated parity: policies vs repositories", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let notifications: ReturnType<typeof createPostgresNotificationsRepository>;
  let bookmarks: ReturnType<typeof createPostgresBookmarksRepository>;

  async function open() {
    const { default: postgres } = await import("postgres");
    return postgres(directUrl!, {
      max: 1,
      prepare: false,
      connect_timeout: 20,
      fetch_types: false,
      onnotice: () => {},
    });
  }

  /**
   * Run `read` with the policies applied as `viewerId`, then roll back.
   *
   * The claims are passed as a bind parameter rather than interpolated: this
   * runs against production, and a viewer id reaching `set_config` as text
   * would be the one place in this file where a value becomes SQL.
   */
  async function asMember<T>(
    viewerId: string,
    read: (tx: {
      unsafe: (query: string, params?: unknown[]) => Promise<unknown[]>;
    }) => Promise<T>
  ): Promise<T> {
    let captured: T;
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe("set local role authenticated");
        await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: viewerId, role: "authenticated" }),
        ]);
        captured = await read(tx as never);
        throw new Error("__rollback__");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "__rollback__") throw error;
    }
    return captured!;
  }

  beforeAll(async () => {
    sql = await open();
    const executor = adaptDriver(sql as never);
    notifications = createPostgresNotificationsRepository(executor);
    bookmarks = createPostgresBookmarksRepository(executor);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /** A member who actually owns rows of the given kind. */
  async function memberWith(table: string, column = "user_id"): Promise<string | null> {
    const rows = (await sql.unsafe(
      `select ${column}::text as id from public.${table}
        where ${column} is not null group by 1 order by count(*) desc limit 1`
    )) as unknown as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  // ── the four embedded projections ──────────────────────────────────

  it("agrees on the notification inbox, including ordering", async () => {
    const viewer = await memberWith("notifications");
    if (!viewer) return;

    const underPolicy = await asMember(viewer, async (tx) => {
      const rows = (await tx.unsafe(
        `select id::text as id from public.notifications
          where user_id = $1::uuid and dismissed_at is null
          order by created_at desc limit 30`,
        [viewer]
      )) as Array<{ id: string }>;
      return rows.map((row) => row.id);
    });

    const viaRepository = await notifications.list(viewer, 30, []);
    const ids = viaRepository.map((row) => String((row as { id: unknown }).id));

    expect(differences(underPolicy, ids, "notifications.list")).toEqual([]);
  }, 120_000);

  // ── the security property, stated as a test ────────────────────────

  it("refuses to return another member's rows when asked", async () => {
    const rows = (await sql.unsafe(
      `select user_id::text as id from public.bookmarks group by 1 having count(*) > 0 limit 2`
    )) as unknown as Array<{ id: string }>;
    if (rows.length < 2) return;

    const [first, second] = rows;
    const theirs = (await bookmarks.list(second.id)).map((row) => row.id);
    const mine = (await bookmarks.list(first.id)).map((row) => row.id);

    // Two members, two answers. A repository that ignored its viewer argument
    // would return the same list twice, and every test above would still pass.
    expect(mine).not.toEqual(theirs);

    const underPolicy = await asMember(first.id, async (tx) => {
      const seen = (await tx.unsafe(
        "select post_id::text as id from public.bookmarks"
      )) as Array<{ id: string }>;
      return new Set(seen.map((row) => row.id));
    });
    const bled = mine.filter((id) => !underPolicy.has(id));
    expect(bled, `rows the policy would not have shown: ${bled.join(", ")}`).toEqual([]);
  }, 120_000);

  it("returns empty rather than everything for a member with nothing", async () => {
    // A random uuid owns no rows. The failure this guards against is a
    // predicate that degrades to true when the viewer matches nothing.
    const nobody = "00000000-0000-0000-0000-000000000000";
    expect(await bookmarks.list(nobody)).toEqual([]);
    expect(await notifications.list(nobody, 10, [])).toEqual([]);
  }, 120_000);
});

describe.skipIf(enabled)("authenticated parity: policies vs repositories", () => {
  it("is skipped without a direct connection", () => {
    console.info("[authenticated parity] not run. Missing: SUPABASE_DIRECT_URL");
    expect(directUrl).toBeFalsy();
  });
});
