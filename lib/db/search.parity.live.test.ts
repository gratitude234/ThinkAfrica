import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, compared
 * field by field, for search.
 *
 * LIVE SAME-DATABASE PARITY. Both sides see identical rows at the same
 * instant, so a difference is a difference in the query rather than in the
 * data.
 *
 * ## Why this one uses the anon key, not the service role
 *
 * The other parity harnesses read through the service role, which bypasses
 * RLS, because the queries they compare filter to public rows themselves. This
 * one cannot: the whole point of the search comparison is that `profiles` has
 * a policy, and comparing "service role, no policy" against "direct
 * connection, policy reproduced in SQL" would report a difference on every
 * suspended member and call the correct side wrong.
 *
 * So the PostgREST side is the anon client, which is what a logged-out
 * searcher actually is, and the PostgreSQL side is asked for `viewerId: null`.
 * That is the comparison that means something.
 *
 * READ ONLY on both sides.
 *
 * Run with:  node scripts/migration/search-parity.mjs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(supabaseUrl && anonKey && serviceKey && directUrl);

const { createSupabaseSearchRepository, createPostgresSearchRepository } =
  await import("@/lib/db/search");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { canonical, differences } from "@/lib/db/parityDiff";

import type { SearchRepository } from "@/lib/db/search";

vi.setConfig({ testTimeout: 180_000 });

const LOGGED_OUT = { viewerId: null, limit: 15 };

describe.skipIf(!enabled)("search: PostgREST vs PostgreSQL, same database", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let viaRest: SearchRepository;
  let viaSql: SearchRepository;
  let words: string[];

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

  beforeAll(async () => {
    const { createClient } = await import("@supabase/supabase-js");

    // Anon, deliberately. See the note above.
    viaRest = createSupabaseSearchRepository(
      createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as never
    );

    sql = await open();
    const executor = adaptDriver(sql as never);
    viaSql = createPostgresSearchRepository(executor);

    const rows = await executor.query<{ word: string }>(
      `select distinct lower(split_part(btrim(p.title), ' ', 1)) as word
       from public.posts p
       where p.status = 'published' and length(btrim(p.title)) > 6
       limit 10`
    );
    words = rows.map((row) => row.word).filter(Boolean);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("has search terms to compare", () => {
    expect(words.length).toBeGreaterThan(0);
  });

  it("agrees on the post results, in order", async () => {
    const mismatches: string[] = [];
    for (const word of words) {
      const [rest, direct] = await Promise.all([
        viaRest.posts(word, LOGGED_OUT),
        viaSql.posts(word, LOGGED_OUT),
      ]);
      mismatches.push(
        ...differences(rest, direct).map((line) => `"${word}": ${line}`)
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the people results", async () => {
    const mismatches: string[] = [];
    for (const word of words) {
      const [rest, direct] = await Promise.all([
        viaRest.people(word, { viewerId: null, limit: 8 }),
        viaSql.people(word, { viewerId: null, limit: 8 }),
      ]);

      // No ORDER BY on either side, so compare as a set keyed by id. That the
      // limit is applied to an unordered set is a pre-existing property of
      // this query, recorded as a finding rather than changed here.
      const index = (rows: typeof rest) =>
        Object.fromEntries(rows.map((row) => [row.id, row]));

      if (rest.length !== direct.length) {
        mismatches.push(`"${word}": length ${rest.length} vs ${direct.length}`);
        continue;
      }
      mismatches.push(
        ...differences(index(rest), index(direct)).map(
          (line) => `"${word}": ${line}`
        )
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the opportunity results, in order", async () => {
    const mismatches: string[] = [];
    for (const word of words) {
      const [rest, direct] = await Promise.all([
        viaRest.opportunities(word, { limit: 6 }),
        viaSql.opportunities(word, { limit: 6 }),
      ]);
      mismatches.push(
        ...differences(rest, direct).map((line) => `"${word}": ${line}`)
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the typeahead results, as a set", async () => {
    const mismatches: string[] = [];
    for (const word of words) {
      const [rest, direct] = await Promise.all([
        viaRest.overlayPosts(word, { viewerId: null, limit: 6 }),
        viaSql.overlayPosts(word, { viewerId: null, limit: 6 }),
      ]);

      // LIMIT with no ORDER BY has no defined result set, so which six rows
      // come back is the plan's choice and may differ between transports. What
      // must agree is that every returned row is a legitimate match, and that
      // both sides return the same number.
      expect(rest.length).toBe(direct.length);
      for (const row of [...rest, ...direct]) {
        if (!(row.title ?? "").toLowerCase().includes(word.toLowerCase())) {
          mismatches.push(`"${word}": ${canonical(row.title)} does not match`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the escaping of a wildcard search", async () => {
    const mismatches: string[] = [];
    for (const query of ["%", "_", "a,b", "a)b", '"', "\\"]) {
      const [rest, direct] = await Promise.all([
        viaRest.posts(query, LOGGED_OUT),
        viaSql.posts(query, LOGGED_OUT),
      ]);
      mismatches.push(
        ...differences(rest, direct).map((line) => `${canonical(query)}: ${line}`)
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the tag sample size", async () => {
    const [rest, direct] = await Promise.all([
      viaRest.publishedTagSample(500),
      viaSql.publishedTagSample(500),
    ]);

    // The sample is 500 rows with no ORDER BY, so the two sides need not pick
    // the same 500. What must agree is how many, and that every value is an
    // array of strings rather than a Postgres literal.
    expect(rest.length).toBe(direct.length);
    for (const row of direct) {
      if (row.tags === null) continue;
      expect(Array.isArray(row.tags)).toBe(true);
    }
  });
});
