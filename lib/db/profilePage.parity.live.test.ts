import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, compared
 * field by field, for the public profile.
 *
 * This is LIVE SAME-DATABASE PARITY, and it is a different and stronger claim
 * than the behavioural proofs in `profilePage.neon.test.ts` and
 * `profileRecord.neon.test.ts`. Both sides here see identical rows at the same
 * instant, so any difference is a difference in the query rather than in the
 * data. The Neon comparison can never say that, because Neon is a copy taken
 * at a different time.
 *
 * READ ONLY on both sides.
 *
 * Run with:  node scripts/migration/profile-parity.mjs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(supabaseUrl && serviceKey && directUrl);

const {
  createSupabaseProfilePageRepository,
  createPostgresProfilePageRepository,
} = await import("@/lib/db/profilePage");
const {
  createSupabaseProfileRecordRepository,
  createPostgresProfileRecordRepository,
} = await import("@/lib/db/profileRecord");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { canonical, differences } from "@/lib/db/parityDiff";
import { legacyTypesForContentKind, type ContentKind } from "@/lib/contentModel";

import type { ProfilePageRepository } from "@/lib/db/profilePage";
import type { ProfileRecordRepository } from "@/lib/db/profileRecord";

const KINDS: ContentKind[] = ["article", "post", "research"];

const RECORD_BASE = {
  kinds: null,
  includeResearch: true,
  sourceBacked: null,
  citable: null,
  entryIds: null,
  start: 0,
  pageSize: 10,
} as const;

vi.setConfig({ testTimeout: 180_000 });

describe.skipIf(!enabled)("public profile: PostgREST vs PostgreSQL, same database", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let pageRest: ProfilePageRepository;
  let pageSql: ProfilePageRepository;
  let recordRest: ProfileRecordRepository;
  let recordSql: ProfileRecordRepository;
  let profiles: string[];

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
    const client = createClient(supabaseUrl!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as never;

    pageRest = createSupabaseProfilePageRepository(client);
    recordRest = createSupabaseProfileRecordRepository(client);

    sql = await open();
    const executor = adaptDriver(sql as never);
    pageSql = createPostgresProfilePageRepository(executor);
    recordSql = createPostgresProfileRecordRepository(executor);

    // The busiest profiles, because an empty one agrees trivially and proves
    // nothing about a join.
    const rows = await executor.query<{ id: string }>(
      `select profile_id::text as id
       from public.profile_record_entries
       group by profile_id
       order by count(*) desc
       limit 8`
    );
    profiles = rows.map((row) => row.id);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("has profiles to compare", () => {
    expect(profiles.length).toBeGreaterThan(0);
  });

  it("agrees on the relationship counts", async () => {
    const mismatches: string[] = [];
    for (const id of profiles) {
      const [rest, direct] = await Promise.all([
        pageRest.relationshipCounts(id),
        pageSql.relationshipCounts(id),
      ]);
      mismatches.push(
        ...differences(rest, direct).map((line) => `${id}: ${line}`)
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the viewer relationship, for a real follow edge", async () => {
    const executor = adaptDriver(sql as never);
    const edges = await executor.query<{ follower: string; following: string }>(
      `select follower_id::text as follower, following_id::text as following
       from public.follows limit 8`
    );

    const mismatches: string[] = [];
    for (const edge of edges) {
      for (const includeSubscription of [true, false]) {
        const [rest, direct] = await Promise.all([
          pageRest.viewerRelationship(edge.following, edge.follower, {
            includeSubscription,
          }),
          pageSql.viewerRelationship(edge.following, edge.follower, {
            includeSubscription,
          }),
        ]);
        mismatches.push(
          ...differences(rest, direct).map(
            (line) => `${edge.follower}->${edge.following} (sub=${includeSubscription}): ${line}`
          )
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the opportunity state", async () => {
    const mismatches: string[] = [];
    for (const id of profiles) {
      const [rest, direct] = await Promise.all([
        pageRest.opportunityState(id),
        pageSql.opportunityState(id),
      ]);
      mismatches.push(...differences(rest, direct).map((line) => `${id}: ${line}`));
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on featured work, including its order", async () => {
    const mismatches: string[] = [];
    for (const id of profiles) {
      const [rest, direct] = await Promise.all([
        pageRest.featuredWork(id, { includeNote: false }),
        pageSql.featuredWork(id, { includeNote: false }),
      ]);

      // Compared in sequence, not as a set: position order is what the
      // profile renders, so a difference in it is a real difference.
      mismatches.push(...differences(rest, direct).map((line) => `${id}: ${line}`));
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on both publication branches", async () => {
    const mismatches: string[] = [];
    for (const id of profiles) {
      for (const kind of KINDS) {
        const input = {
          profileId: id,
          contentKind: kind,
          legacyTypes: legacyTypesForContentKind(kind),
          start: 0,
          limit: 10,
        };
        const [rest, direct] = await Promise.all([
          pageRest.publicationBranches(input),
          pageSql.publicationBranches(input),
        ]);

        mismatches.push(
          ...differences(rest.owned, direct.owned).map(
            (line) => `${id}/${kind} owned: ${line}`
          )
        );

        // The co-authored branch is bounded on `accepted_at`, and ties there
        // are common enough that a sequence comparison would report a stable
        // difference that is not one. The set is what the merge consumes.
        const ids = (list: Array<{ id: string }>) =>
          [...list.map((row) => row.id)].sort();
        if (canonical(ids(rest.coauthored)) !== canonical(ids(direct.coauthored))) {
          mismatches.push(
            `${id}/${kind} coauthored: ${canonical(ids(rest.coauthored))} vs ${canonical(ids(direct.coauthored))}`
          );
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the record summary", async () => {
    const mismatches: string[] = [];
    for (const id of profiles) {
      for (const includeResearch of [true, false]) {
        const [rest, direct] = await Promise.all([
          recordRest.recordSummary(id, includeResearch),
          recordSql.recordSummary(id, includeResearch),
        ]);

        // PostgREST returns a single-row TABLE function as an array; so does
        // the direct call. The counts inside are bigints on both sides, which
        // arrive as strings, so compare them as numbers rather than as text.
        const numbers = (value: unknown) =>
          (Array.isArray(value) ? value : [value]).map((row) =>
            Object.fromEntries(
              Object.entries(row as Record<string, unknown>).map(([key, entry]) => [
                key,
                Number(entry),
              ])
            )
          );

        mismatches.push(
          ...differences(numbers(rest), numbers(direct)).map(
            (line) => `${id} (research=${includeResearch}): ${line}`
          )
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on a record page, under every filter combination", async () => {
    const mismatches: string[] = [];
    const combinations = [
      { ...RECORD_BASE },
      { ...RECORD_BASE, includeResearch: false },
      { ...RECORD_BASE, kinds: ["publication"] as string[] },
      { ...RECORD_BASE, kinds: ["publication", "research"] as string[] },
      { ...RECORD_BASE, kinds: ["response"] as string[] },
      { ...RECORD_BASE, sourceBacked: true as boolean | null },
      { ...RECORD_BASE, citable: true as boolean | null },
      { ...RECORD_BASE, start: 10 },
    ];

    for (const id of profiles.slice(0, 4)) {
      for (const combination of combinations) {
        const input = { ...combination, profileId: id };
        const [rest, direct] = await Promise.all([
          recordRest.entries(input),
          recordSql.entries(input),
        ]);

        if (rest.totalCount !== direct.totalCount) {
          mismatches.push(
            `${id} ${canonical(combination)}: totalCount ${rest.totalCount} vs ${direct.totalCount}`
          );
        }
        mismatches.push(
          ...differences(rest.entries, direct.entries).map(
            (line) => `${id} ${canonical(combination)}: ${line}`
          )
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the hydrated publications, co-authors included", async () => {
    const mismatches: string[] = [];
    for (const id of profiles.slice(0, 4)) {
      const page = await recordSql.entries({ ...RECORD_BASE, profileId: id, pageSize: 5 });
      const ids = page.entries.map((entry) => entry.entry_id);
      if (ids.length === 0) continue;

      // Both sides take the viewer: the co-author projection is governed by
      // the profiles policy. Null is the logged-out reader, which is what
      // this comparison is about. The harness predates that parameter.
      const [rest, direct] = await Promise.all([
        recordRest.hydratePublications(ids, null),
        recordSql.hydratePublications(ids, null),
      ]);

      // `in` has no defined order on either side, and the caller indexes by
      // id, so compare as a set keyed by id. Within a post the co-author list
      // is compared as a set for the same reason.
      const index = (rows: typeof rest) =>
        Object.fromEntries(
          rows.map((row) => [
            row.id,
            {
              ...row,
              post_authors: [...(row.post_authors ?? [])].sort((a, b) =>
                a.user_id.localeCompare(b.user_id)
              ),
            },
          ])
        );

      mismatches.push(
        ...differences(index(rest), index(direct)).map((line) => `${id}: ${line}`)
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the topic scan", async () => {
    const mismatches: string[] = [];
    for (const id of profiles.slice(0, 4)) {
      const [rest, direct] = await Promise.all([
        recordRest.topicPosts(id, 50),
        recordSql.topicPosts(id, 50),
      ]);

      mismatches.push(
        ...differences(rest.owned, direct.owned).map((line) => `${id} owned: ${line}`)
      );

      const ids = (list: Array<{ id: string }>) => [...list.map((row) => row.id)].sort();
      if (canonical(ids(rest.coauthored)) !== canonical(ids(direct.coauthored))) {
        mismatches.push(
          `${id} coauthored: ${canonical(ids(rest.coauthored))} vs ${canonical(ids(direct.coauthored))}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });
});
