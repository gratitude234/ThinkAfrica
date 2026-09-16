import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, compared
 * field by field, for the public profile.
 *
 * This is LIVE SAME-DATABASE PARITY, and it is a different and stronger claim
 * than the behavioural proofs in `profilePage.neon.test.ts`. Both sides here
 * see identical rows at the same instant, so any difference is a difference in
 * the query rather than in the data. The Neon comparison can never say that,
 * because Neon is a copy taken at a different time.
 *
 * The publishing reset, Phase 2G, removed featured work and the Intellectual
 * Record repository (summary, entries, hydration, topic scan) from the profile,
 * and their comparisons with them.
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
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { canonical, differences } from "@/lib/db/parityDiff";
import type { ProfilePublicationKind } from "@/lib/profileTabs";

import type { ProfilePageRepository } from "@/lib/db/profilePage";

const KINDS: ProfilePublicationKind[] = ["article", "post"];

vi.setConfig({ testTimeout: 180_000 });

describe.skipIf(!enabled)("public profile: PostgREST vs PostgreSQL, same database", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let pageRest: ProfilePageRepository;
  let pageSql: ProfilePageRepository;
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

    sql = await open();
    const executor = adaptDriver(sql as never);
    pageSql = createPostgresProfilePageRepository(executor);

    // The busiest writers, because an empty profile agrees trivially and
    // proves nothing about a join.
    const rows = await executor.query<{ id: string }>(
      `select author_id::text as id
       from public.posts
       where status = 'published' and author_id is not null
       group by author_id
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
      const [rest, direct] = await Promise.all([
        pageRest.viewerRelationship(edge.following, edge.follower),
        pageSql.viewerRelationship(edge.following, edge.follower),
      ]);
      mismatches.push(
        ...differences(rest, direct).map(
          (line) => `${edge.follower}->${edge.following}: ${line}`
        )
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on both publication branches, for Posts and for Articles", async () => {
    const mismatches: string[] = [];
    for (const id of profiles) {
      for (const kind of KINDS) {
        const input = {
          profileId: id,
          contentKinds: [kind],
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

  it("agrees on the owner's drafts, and on refusing them to anyone else", async () => {
    // The service-role client bypasses RLS, so this compares the repositories'
    // own owner check and filters, which is the whole authorization on the
    // direct path.
    const mismatches: string[] = [];
    for (const id of profiles) {
      const [rest, direct] = await Promise.all([
        pageRest.ownerDrafts({ profileId: id, viewerId: id }),
        pageSql.ownerDrafts({ profileId: id, viewerId: id }),
      ]);
      mismatches.push(
        ...differences(rest, direct).map((line) => `${id} drafts: ${line}`)
      );

      const stranger = "00000000-0000-0000-0000-000000000000";
      const [restStranger, directStranger] = await Promise.all([
        pageRest.ownerDrafts({ profileId: id, viewerId: stranger }),
        pageSql.ownerDrafts({ profileId: id, viewerId: stranger }),
      ]);
      if (restStranger.length > 0 || directStranger.length > 0) {
        mismatches.push(`${id} drafts leaked to a stranger`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
