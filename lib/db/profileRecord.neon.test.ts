import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the public profile record's reads, against real
 * PostgreSQL.
 *
 * This is not live same-database parity. It proves the SQL does what the
 * PostgREST calls did: the filter combinations, the exact count, the
 * co-author embed's shape, and the summary function's two-attempt fallback.
 *
 * Read-only. Nothing here writes.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresProfileRecordRepository } = await import(
  "@/lib/db/profileRecord"
);
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { ProfileRecordRepository } from "@/lib/db/profileRecord";

const NO_SUCH_PROFILE = "00000000-0000-0000-0000-000000000000";

// A cold pooled connection can take longer than the 5s default before the
// first statement returns, and every test here starts with a real round trip.
vi.setConfig({ testTimeout: 60_000 });


const BASE = {
  kinds: null,
  includeResearch: true,
  sourceBacked: null,
  citable: null,
  entryIds: null,
  start: 0,
  pageSize: 10,
} as const;

describe.skipIf(!enabled)("profile record reads against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: ProfileRecordRepository;

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
    repository = createPostgresProfileRecordRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function someProfile() {
    const [row] = await executor.query<{ id: string }>(
      `select profile_id::text as id
       from public.profile_record_entries
       group by profile_id order by count(*) desc limit 1`
    );
    return row?.id ?? null;
  }

  // ── summary ────────────────────────────────────────────────────────

  it("returns the counts strip, falling back when v2 is absent", async () => {
    const profile = await someProfile();
    if (!profile) return;

    // The point of the test: whichever of the two functions this database has,
    // the call answers. Production has only v1 today; a database with the
    // 20260907000001 migration applied has both, and the caller cannot tell.
    const payload = (await repository.recordSummary(profile, true)) as Array<
      Record<string, unknown>
    >;

    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(1);
    expect(payload[0]).toHaveProperty("publication_count");
    expect(payload[0]).toHaveProperty("response_count");
  });

  it("does not swallow a real function failure as a missing function", async () => {
    // A bad argument is a data error, not an absent function, and must reach
    // the caller rather than falling through to a second attempt that fails
    // the same way and reports the second message.
    await expect(
      repository.recordSummary("not-a-uuid", true)
    ).rejects.toThrow();
  });

  it("excludes research from the summary when the caller says to", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const withResearch = (await repository.recordSummary(profile, true)) as Array<
      Record<string, unknown>
    >;
    const without = (await repository.recordSummary(profile, false)) as Array<
      Record<string, unknown>
    >;

    expect(Number(without[0].research_count)).toBe(0);
    expect(Number(without[0].publication_count)).toBeLessThanOrEqual(
      Number(withResearch[0].publication_count)
    );
  });

  // ── entries ────────────────────────────────────────────────────────

  it("returns an empty page and a zero count for a profile with no record", async () => {
    const page = await repository.entries({ ...BASE, profileId: NO_SUCH_PROFILE });
    expect(page.entries).toEqual([]);
    expect(page.totalCount).toBe(0);
  });

  it("returns the total before pagination, as a number", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile, pageSize: 2 });
    const [truth] = await executor.query<{ n: string }>(
      `select count(*) as n from public.profile_record_entries where profile_id = $1::uuid`,
      [profile]
    );

    expect(typeof page.totalCount).toBe("number");
    expect(page.totalCount).toBe(Number(truth.n));
    // The count is the whole set; the page is the slice. Conflating them is
    // what makes "next page" disappear one page early.
    expect(page.entries.length).toBeLessThanOrEqual(2);
  });

  it("does not leak the window's count column into the entry rows", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile });
    for (const entry of page.entries) {
      expect(entry).not.toHaveProperty("total_count");
    }
  });

  it("returns only rows for the requested profile", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile, pageSize: 50 });
    for (const entry of page.entries) {
      expect(entry.profile_id).toBe(profile);
    }
  });

  it("drops research entries when includeResearch is false", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({
      ...BASE,
      profileId: profile,
      includeResearch: false,
      pageSize: 100,
    });
    expect(page.entries.some((entry) => entry.entry_kind === "research")).toBe(false);
  });

  it("filters to a single kind, and to a set of kinds", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const one = await repository.entries({
      ...BASE,
      profileId: profile,
      kinds: ["publication"],
      pageSize: 100,
    });
    expect(one.entries.every((entry) => entry.entry_kind === "publication")).toBe(true);

    const two = await repository.entries({
      ...BASE,
      profileId: profile,
      kinds: ["publication", "research"],
      pageSize: 100,
    });
    expect(
      two.entries.every((entry) =>
        ["publication", "research"].includes(entry.entry_kind)
      )
    ).toBe(true);
    expect(two.totalCount).toBeGreaterThanOrEqual(one.totalCount);
  });

  it("applies a quality filter as a restriction, not as an equality on false", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const all = await repository.entries({ ...BASE, profileId: profile, pageSize: 100 });
    const backed = await repository.entries({
      ...BASE,
      profileId: profile,
      sourceBacked: true,
      pageSize: 100,
    });

    expect(backed.entries.every((entry) => entry.source_backed)).toBe(true);
    // null must mean "do not filter". If it were sent as false the unfiltered
    // page would be the complement of this one rather than a superset of it.
    expect(all.totalCount).toBeGreaterThanOrEqual(backed.totalCount);
  });

  it("restricts to the given entry ids", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile, pageSize: 3 });
    if (page.entries.length === 0) return;

    const wanted = [page.entries[0].entry_id];
    const restricted = await repository.entries({
      ...BASE,
      profileId: profile,
      entryIds: wanted,
      pageSize: 100,
    });

    expect(restricted.entries.map((entry) => entry.entry_id)).toEqual(wanted);
    expect(restricted.totalCount).toBe(1);
  });

  it("orders newest first and breaks ties on entry id", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile, pageSize: 50 });
    for (let i = 1; i < page.entries.length; i += 1) {
      const previous = Date.parse(page.entries[i - 1].occurred_at);
      const current = Date.parse(page.entries[i].occurred_at);
      expect(current).toBeLessThanOrEqual(previous);
      if (current === previous) {
        expect(
          page.entries[i].entry_id < page.entries[i - 1].entry_id
        ).toBe(true);
      }
    }
  });

  it("paginates without repeating a row across pages", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const first = await repository.entries({ ...BASE, profileId: profile, pageSize: 3 });
    if (first.totalCount <= 3) return;

    const second = await repository.entries({
      ...BASE,
      profileId: profile,
      start: 3,
      pageSize: 3,
    });

    const overlap = second.entries.filter((entry) =>
      first.entries.some((other) => other.entry_id === entry.entry_id)
    );
    expect(overlap).toEqual([]);
  });

  // ── hydration ──────────────────────────────────────────────────────

  it("returns an empty array for no ids, without going to the database", async () => {
    expect(await repository.hydratePublications([])).toEqual([]);
  });

  it("returns one row per requested post, and no others", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile, pageSize: 5 });
    const ids = page.entries.map((entry) => entry.entry_id);
    if (ids.length === 0) return;

    const posts = await repository.hydratePublications(ids);
    expect(posts.length).toBeLessThanOrEqual(ids.length);
    for (const post of posts) {
      expect(ids).toContain(post.id);
    }
    expect(new Set(posts.map((post) => post.id)).size).toBe(posts.length);
  });

  it("attaches co-authors as an array, empty rather than null when there are none", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const page = await repository.entries({ ...BASE, profileId: profile, pageSize: 5 });
    const ids = page.entries.map((entry) => entry.entry_id);
    if (ids.length === 0) return;

    const posts = await repository.hydratePublications(ids);
    for (const post of posts) {
      // PostgREST gives [] for an empty embed. A null here would reach
      // normalizePost's `?? []` and pass silently, so assert the shape.
      expect(Array.isArray(post.post_authors)).toBe(true);
      if (post.tags !== null) expect(Array.isArray(post.tags)).toBe(true);
    }
  });

  it("gives each co-author a profile object, not an array", async () => {
    const [row] = await executor.query<{ post_id: string }>(
      `select pa.post_id::text as post_id
       from public.post_authors pa
       join public.profiles pr on pr.id = pa.user_id
       limit 1`
    );
    if (!row) return;

    const [post] = await repository.hydratePublications([row.post_id]);
    if (!post) return;

    const authors = post.post_authors ?? [];
    expect(authors.length).toBeGreaterThan(0);
    const withProfile = authors.find((author) => author.profile !== null);
    if (!withProfile) return;
    expect(Array.isArray(withProfile.profile)).toBe(false);
    expect(withProfile.profile).toHaveProperty("username");
  });

  // ── topic index ────────────────────────────────────────────────────

  it("returns empty branches for a profile with no posts", async () => {
    const scan = await repository.topicPosts(NO_SUCH_PROFILE, 50);
    expect(scan).toEqual({ owned: [], coauthored: [] });
  });

  it("returns only published posts on the owned branch, newest first", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const { owned } = await repository.topicPosts(profile, 50);
    const ids = owned.map((post) => post.id);
    if (ids.length === 0) return;

    const unpublished = await executor.query<{ id: string }>(
      `select id::text as id from public.posts
       where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         and status <> 'published'`,
      [JSON.stringify(ids)]
    );
    expect(unpublished).toEqual([]);

    for (const post of owned) {
      expect(post.author_id).toBe(profile);
      if (post.tags !== null) expect(Array.isArray(post.tags)).toBe(true);
    }
  });

  it("returns status on the co-authored branch so the caller can filter it", async () => {
    const [row] = await executor.query<{ user_id: string }>(
      `select pa.user_id::text as user_id
       from public.post_authors pa
       where pa.accepted_at is not null
       limit 1`
    );
    if (!row) return;

    const { coauthored } = await repository.topicPosts(row.user_id, 50);
    // The branch deliberately does not filter on status: the cap bounds how
    // much history is read, and filtering in SQL would change what it bounds.
    for (const post of coauthored) {
      expect(typeof post.status).toBe("string");
    }
  });

  it("honours the scan cap on both branches", async () => {
    const profile = await someProfile();
    if (!profile) return;

    const scan = await repository.topicPosts(profile, 2);
    expect(scan.owned.length).toBeLessThanOrEqual(2);
    expect(scan.coauthored.length).toBeLessThanOrEqual(2);
  });
});
