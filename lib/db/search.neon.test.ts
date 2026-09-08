import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for search, against real PostgreSQL.
 *
 * This is not live same-database parity. It proves the SQL does what the
 * PostgREST calls did: the same filters, the same escaping, the same limits,
 * the same ordering, and, most importantly, the `profiles` visibility rule
 * that RLS was carrying and that a direct connection has to reproduce.
 *
 * The visibility assertions build their own fixtures inside a transaction and
 * roll it back, because a suspended or members-only profile is not something
 * production data can be relied on to contain, and "no such row" is exactly
 * the shape a broken visibility check has.
 *
 * Read-only apart from transactions that are rolled back.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresSearchRepository } = await import("@/lib/db/search");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { SearchRepository } from "@/lib/db/search";

vi.setConfig({ testTimeout: 60_000 });

const LOGGED_OUT = { viewerId: null, limit: 20 };

describe.skipIf(!enabled)("search against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: SearchRepository;

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
    repository = createPostgresSearchRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  /** A word that appears in a published title, so the searches have material. */
  async function someTitleWord() {
    const [row] = await executor.query<{ word: string }>(
      `select lower(split_part(btrim(p.title), ' ', 1)) as word
       from public.posts p
       where p.status = 'published' and length(btrim(p.title)) > 6
       limit 1`
    );
    return row?.word ?? null;
  }

  // ── posts ──────────────────────────────────────────────────────────

  it("returns only published posts", async () => {
    const word = await someTitleWord();
    if (!word) return;

    const results = await repository.posts(word, LOGGED_OUT);
    expect(results.length).toBeGreaterThan(0);

    const ids = results.map((row) => row.id);
    const leaked = await executor.query<{ id: string }>(
      `select id::text as id from public.posts
       where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         and status <> 'published'`,
      [JSON.stringify(ids)]
    );
    expect(leaked).toEqual([]);
  });

  it("matches on the title or the excerpt, case-insensitively", async () => {
    const word = await someTitleWord();
    if (!word) return;

    const lower = await repository.posts(word.toLowerCase(), LOGGED_OUT);
    const upper = await repository.posts(word.toUpperCase(), LOGGED_OUT);

    expect(lower.map((row) => row.id)).toEqual(upper.map((row) => row.id));
    for (const row of lower) {
      const haystack = `${row.title ?? ""} ${row.excerpt ?? ""}`.toLowerCase();
      expect(haystack).toContain(word.toLowerCase());
    }
  });

  it("orders by published_at descending", async () => {
    const word = await someTitleWord();
    if (!word) return;

    const results = await repository.posts(word, LOGGED_OUT);
    const stamps = results.map((row) =>
      row.published_at ? Date.parse(row.published_at) : null
    );

    // Nulls first under desc, which is what the PostgREST order gave: it named
    // no nulls clause, so both sides get PostgreSQL's default.
    const firstReal = stamps.findIndex((value) => value !== null);
    if (firstReal < 0) return;
    expect(stamps.slice(0, firstReal).every((value) => value === null)).toBe(true);
    for (let i = firstReal + 1; i < stamps.length; i += 1) {
      if (stamps[i] === null) continue;
      expect(stamps[i]!).toBeLessThanOrEqual(stamps[i - 1] ?? Infinity);
    }
  });

  it("honours the limit", async () => {
    const word = await someTitleWord();
    if (!word) return;
    const results = await repository.posts(word, { viewerId: null, limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("treats a LIKE wildcard as literal text, not as a wildcard", async () => {
    // The whole point of escapeLikeFragment. A search for "%" must not match
    // every post; unescaped it matches all of them.
    const everything = await repository.posts("%", LOGGED_OUT);
    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.posts
       where status = 'published' and (title like '%\\%%' or excerpt like '%\\%%')`
    );
    expect(everything.length).toBeLessThanOrEqual(Number(n));
  });

  it("treats an underscore as literal text", async () => {
    const results = await repository.posts("a_b", LOGGED_OUT);
    for (const row of results) {
      const haystack = `${row.title ?? ""} ${row.excerpt ?? ""}`.toLowerCase();
      expect(haystack).toContain("a_b");
    }
  });

  it("survives the punctuation that used to break the PostgREST filter", async () => {
    // A comma ended the or= list and made the whole search fail. Here it is
    // just a character in a bound parameter.
    for (const query of ["a,b", "a)b", "a(b", 'a"b', "a.b", "a\\b"]) {
      await expect(repository.posts(query, LOGGED_OUT)).resolves.toBeInstanceOf(
        Array
      );
    }
  });

  it("returns the author projection as an object, or null", async () => {
    const word = await someTitleWord();
    if (!word) return;

    const results = await repository.posts(word, LOGGED_OUT);
    for (const row of results) {
      if (row.profiles === null) continue;
      expect(Array.isArray(row.profiles)).toBe(false);
      expect(row.profiles).toHaveProperty("username");
      expect(row.profiles).toHaveProperty("full_name");
      expect(row.profiles).toHaveProperty("university");
    }
  });

  // ── overlay ────────────────────────────────────────────────────────

  it("matches the typeahead on the title only", async () => {
    const word = await someTitleWord();
    if (!word) return;

    const results = await repository.overlayPosts(word, {
      viewerId: null,
      limit: 6,
    });
    expect(results.length).toBeLessThanOrEqual(6);
    for (const row of results) {
      expect((row.title ?? "").toLowerCase()).toContain(word.toLowerCase());
    }
  });

  it("gives the typeahead the narrower author projection", async () => {
    const word = await someTitleWord();
    if (!word) return;

    const results = await repository.overlayPosts(word, {
      viewerId: null,
      limit: 6,
    });
    for (const row of results) {
      if (row.profiles === null) continue;
      // The typeahead's embed asks for two columns. Handing it a third would
      // widen a projection nobody asked to widen.
      expect(Object.keys(row.profiles).sort()).toEqual(["full_name", "username"]);
    }
  });

  // ── people, and the visibility rule ────────────────────────────────

  it("finds a public member by username", async () => {
    const [row] = await executor.query<{ username: string }>(
      `select p.username from public.profiles p
       where p.username is not null
         and p.suspended_at is null
         and coalesce(p.privacy_settings ->> 'profile_visibility', 'public') = 'public'
       limit 1`
    );
    if (!row) return;

    const results = await repository.people(row.username, LOGGED_OUT);
    expect(results.map((person) => person.username)).toContain(row.username);
  });

  it("hides a suspended member from a logged-out searcher", async () => {
    await sql.begin(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresSearchRepository(executorTx);
      const username = `zz-suspended-${Date.now()}`;

      await executorTx.query(
        `insert into public.profiles (id, username, full_name, suspended_at)
         values (gen_random_uuid(), $1::text, 'Suspended Person', now())`,
        [username]
      );

      const results = await repositoryTx.people(username, LOGGED_OUT);
      expect(results).toEqual([]);

      throw new Error("rollback");
    }).catch((error) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  });

  it("hides a members_only member from a logged-out searcher, and shows them to a signed-in one", async () => {
    await sql.begin(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresSearchRepository(executorTx);
      const username = `zz-members-${Date.now()}`;

      await executorTx.query(
        `insert into public.profiles (id, username, full_name, privacy_settings)
         values (gen_random_uuid(), $1::text, 'Members Only Person',
                 '{"profile_visibility": "members_only"}'::jsonb)`,
        [username]
      );

      expect(await repositoryTx.people(username, LOGGED_OUT)).toEqual([]);

      // auth.role() = 'authenticated' meant "there is a session". Any viewer
      // id satisfies it, which is the faithful translation.
      const [signedIn] = await executorTx.query<{ id: string }>(
        `select id::text as id from public.profiles where username = $1::text`,
        [username]
      );
      const asMember = await repositoryTx.people(username, {
        viewerId: signedIn.id,
        limit: 20,
      });
      expect(asMember.map((person) => person.username)).toContain(username);

      throw new Error("rollback");
    }).catch((error) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  });

  it("shows a private member only to themselves", async () => {
    await sql.begin(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresSearchRepository(executorTx);
      const username = `zz-private-${Date.now()}`;

      await executorTx.query(
        `insert into public.profiles (id, username, full_name, privacy_settings)
         values (gen_random_uuid(), $1::text, 'Private Person',
                 '{"profile_visibility": "private"}'::jsonb)`,
        [username]
      );
      const [self] = await executorTx.query<{ id: string }>(
        `select id::text as id from public.profiles where username = $1::text`,
        [username]
      );

      expect(await repositoryTx.people(username, LOGGED_OUT)).toEqual([]);

      // Another signed-in member is still refused: 'private' is not
      // 'members_only'.
      const other = await repositoryTx.people(username, {
        viewerId: "00000000-0000-0000-0000-000000000000",
        limit: 20,
      });
      expect(other).toEqual([]);

      const own = await repositoryTx.people(username, {
        viewerId: self.id,
        limit: 20,
      });
      expect(own.map((person) => person.username)).toContain(username);

      throw new Error("rollback");
    }).catch((error) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  });

  it("nulls the author embed for an invisible author, without dropping the post", async () => {
    await sql.begin(async (tx) => {
      const executorTx = adaptDriver(tx as never);
      const repositoryTx = createPostgresSearchRepository(executorTx);

      const [post] = await executorTx.query<{ id: string; title: string }>(
        `select id::text as id, title from public.posts
         where status = 'published' and author_id is not null and title is not null
         limit 1`
      );
      if (!post) throw new Error("rollback");

      await executorTx.query(
        `update public.profiles set suspended_at = now()
         where id = (select author_id from public.posts where id = $1::uuid)`,
        [post.id]
      );

      const results = await repositoryTx.posts(post.title, LOGGED_OUT);
      const found = results.find((row) => row.id === post.id);

      // This is the distinction the join encodes: an invisible author removes
      // the name, not the article. A WHERE clause here would have deleted a
      // published post from search results.
      expect(found).toBeDefined();
      expect(found!.profiles).toBeNull();

      throw new Error("rollback");
    }).catch((error) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  });

  // ── opportunities ──────────────────────────────────────────────────

  it("returns only open fellowships, soonest deadline first, nulls last", async () => {
    const [row] = await executor.query<{ word: string }>(
      `select lower(split_part(btrim(f.title), ' ', 1)) as word
       from public.fellowships f where f.status = 'open' and f.title is not null limit 1`
    );
    if (!row) return;

    const results = await repository.opportunities(row.word, { limit: 20 });
    const stamps = results.map((entry) =>
      entry.deadline ? Date.parse(entry.deadline) : null
    );

    const firstNull = stamps.indexOf(null);
    if (firstNull >= 0) {
      expect(stamps.slice(firstNull).every((value) => value === null)).toBe(true);
    }
    const real = stamps.filter((value): value is number => value !== null);
    for (let i = 1; i < real.length; i += 1) {
      expect(real[i]).toBeGreaterThanOrEqual(real[i - 1]);
    }
  });

  // ── tag sample ─────────────────────────────────────────────────────

  it("returns tags as arrays, never as Postgres literals", async () => {
    const sample = await repository.publishedTagSample(50);
    expect(sample.length).toBeGreaterThan(0);
    for (const row of sample) {
      if (row.tags === null) continue;
      expect(Array.isArray(row.tags)).toBe(true);
      for (const tag of row.tags) expect(typeof tag).toBe("string");
    }
  });

  it("honours the sample size", async () => {
    const sample = await repository.publishedTagSample(7);
    expect(sample.length).toBeLessThanOrEqual(7);
  });

  // ── failure behaviour ──────────────────────────────────────────────

  it("throws on a database failure rather than returning no results", async () => {
    const broken = createPostgresSearchRepository({
      query: async () => {
        throw new Error("connection reset");
      },
    });

    // The bug this guards against was caught once already in the feed
    // repository: an error that becomes [] is a search that reports "nothing
    // found" during an outage.
    await expect(broken.posts("anything", LOGGED_OUT)).rejects.toThrow(
      "connection reset"
    );
    await expect(broken.people("anything", LOGGED_OUT)).rejects.toThrow(
      "connection reset"
    );
  });
});
