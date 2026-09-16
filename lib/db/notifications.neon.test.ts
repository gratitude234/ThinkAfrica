import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the notification inbox, against real PostgreSQL.
 *
 * The property that matters most is agreement: the list and the badge have to
 * apply the same filters, or someone is told they have unread notifications
 * that the inbox will not show them. That was a real bug once, and it is what
 * most of these assertions are about.
 *
 * Read-only.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresNotificationsRepository } = await import(
  "@/lib/db/notifications"
);
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { NotificationsRepository } from "@/lib/db/notifications";

vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(!enabled)("notifications against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: NotificationsRepository;

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
    repository = createPostgresNotificationsRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function someRecipient() {
    const [row] = await executor.query<{ user_id: string }>(
      `select user_id::text as user_id from public.notifications
       group by user_id order by count(*) desc limit 1`
    );
    return row?.user_id ?? null;
  }

  it("returns only this member's notifications", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const rows = await repository.list(userId, 50, []);
    expect(rows.length).toBeGreaterThan(0);

    const ids = rows.map((row) => row.id);
    const foreign = await executor.query<{ id: string }>(
      `select id::text as id from public.notifications
       where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         and user_id <> $2::uuid`,
      [JSON.stringify(ids), userId]
    );

    // The whole table is private per member. Ownership is now a WHERE clause
    // rather than a policy, and this is the assertion that fails if it goes.
    expect(foreign).toEqual([]);
  });

  it("returns nothing for a member with no notifications", async () => {
    expect(
      await repository.list("00000000-0000-0000-0000-000000000000", 50, [])
    ).toEqual([]);
    expect(
      await repository.unreadCount("00000000-0000-0000-0000-000000000000", [])
    ).toBe(0);
  });

  it("excludes dismissed notifications, which are soft-deleted", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const rows = await repository.list(userId, 200, []);
    for (const row of rows) expect(row.dismissed_at).toBeNull();
  });

  it("orders newest first and honours the limit", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const rows = await repository.list(userId, 3, []);
    expect(rows.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < rows.length; i += 1) {
      expect(Date.parse(rows[i].created_at)).toBeLessThanOrEqual(
        Date.parse(rows[i - 1].created_at)
      );
    }
  });

  it("counts as a number, not a bigint string", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const count = await repository.unreadCount(userId, []);
    expect(typeof count).toBe("number");
    expect(Number.isInteger(count)).toBe(true);
  });

  it("counts every unread notification, not just the ones on the first page", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const count = await repository.unreadCount(userId, []);
    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.notifications
       where user_id = $1::uuid and read = false and dismissed_at is null`,
      [userId]
    );

    // The bug this replaced derived the badge from ten fetched rows, so
    // someone with forty unread saw "3".
    expect(count).toBe(Number(n));
  });

  it("applies the same mute filter to the list and the count", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const [row] = await executor.query<{ type: string }>(
      `select type from public.notifications
       where user_id = $1::uuid group by type order by count(*) desc limit 1`,
      [userId]
    );
    if (!row) return;

    const listed = await repository.list(userId, 200, [row.type]);
    expect(listed.some((entry) => entry.type === row.type)).toBe(false);

    const muted = await repository.unreadCount(userId, [row.type]);
    const unmuted = await repository.unreadCount(userId, []);

    // The badge must not count what the inbox will not show. If the two
    // filters ever diverge, this is the difference that catches it.
    expect(muted).toBeLessThanOrEqual(unmuted);

    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.notifications
       where user_id = $1::uuid and read = false and dismissed_at is null
         and type <> $2::text`,
      [userId, row.type]
    );
    expect(muted).toBe(Number(n));
  });

  it("mutes nothing when the list is empty", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    // An empty `in` list is the one that quietly matches everything, which
    // here would mute the entire inbox rather than nothing.
    const all = await repository.list(userId, 200, []);
    expect(all.length).toBeGreaterThan(0);
  });

  it("mutes several types at once", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    const types = await executor.query<{ type: string }>(
      `select type from public.notifications
       where user_id = $1::uuid group by type limit 2`,
      [userId]
    );
    if (types.length < 2) return;

    const muted = types.map((row) => row.type);
    const listed = await repository.list(userId, 200, muted);
    for (const entry of listed) expect(muted).not.toContain(entry.type);
  });

  it("attaches the actor and the post as objects, or null", async () => {
    const userId = await someRecipient();
    if (!userId) return;

    for (const row of await repository.list(userId, 50, [])) {
      if (row.actor !== null) {
        expect(Array.isArray(row.actor)).toBe(false);
        expect(row.actor).toHaveProperty("username");
      }
      if (row.post !== null) {
        expect(Array.isArray(row.post)).toBe(false);
        expect(row.post).toHaveProperty("slug");
        // The caller filters research on these two fields, so they have to
        // arrive rather than being trimmed from the projection.
        expect(row.post).toHaveProperty("type");
        expect(row.post).toHaveProperty("content_kind");
      }
    }
  });

  it("throws on a database failure rather than reporting an empty inbox", async () => {
    const broken = createPostgresNotificationsRepository({
      query: async () => {
        throw new Error("connection reset");
      },
    });

    // The caller turns this into `count: null`, which is what lets the bell
    // leave a stale badge alone instead of clearing it to zero.
    await expect(
      broken.unreadCount("00000000-0000-0000-0000-000000000000", [])
    ).rejects.toThrow("connection reset");
  });
});
