import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, for the
 * viewer's own state: blocks, and whether two people may message.
 *
 * LIVE SAME-DATABASE PARITY.
 *
 * ## Which client, and why the service role is faithful here
 *
 * `lib/blocking.ts` reads through the admin client, and
 * `getMessageEligibility` calls a SECURITY DEFINER function. Neither has ever
 * been subject to RLS, so the service role is what production uses rather than
 * a convenience for the harness.
 *
 * ## Identities
 *
 * Real block edges, chosen from the database. Only ids are read and only ids
 * are compared. Blocking is never disclosed to the blocked side in the
 * product, and nothing here prints a pair.
 *
 * READ ONLY on both sides.
 *
 * Run with:  node scripts/migration/viewerstate-parity.mjs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(supabaseUrl && serviceKey && directUrl);

const {
  createSupabaseViewerStateRepository,
  createPostgresViewerStateRepository,
} = await import("@/lib/db/viewerState");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { canonical } from "@/lib/db/parityDiff";

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { ViewerStateRepository } from "@/lib/db/viewerState";

vi.setConfig({ testTimeout: 180_000 });

describe.skipIf(!enabled)(
  "viewer state: PostgREST vs PostgreSQL, same database",
  () => {
    let sql: Awaited<ReturnType<typeof open>>;
    let executor: SqlExecutor;
    let viaRest: ViewerStateRepository;
    let viaSql: ViewerStateRepository;
    let blockers: string[];

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
      viaRest = createSupabaseViewerStateRepository(
        createClient(supabaseUrl!, serviceKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
        }) as never
      );

      sql = await open();
      executor = adaptDriver(sql as never);
      viaSql = createPostgresViewerStateRepository(executor);

      const rows = await executor.query<{ id: string }>(
        `select blocker_id::text as id from public.user_blocks
         group by blocker_id limit 5`
      );
      blockers = rows.map((row) => row.id);
    }, 180_000);

    afterAll(async () => {
      await sql?.end({ timeout: 5 });
    });

    it("agrees on who a member has blocked", async () => {
      const mismatches: string[] = [];
      for (const blocker of blockers) {
        const [rest, direct] = await Promise.all([
          viaRest.blockedUserIds(blocker),
          viaSql.blockedUserIds(blocker),
        ]);
        // Sets: neither side orders, and the caller builds a Set from it.
        if (canonical([...rest].sort()) !== canonical([...direct].sort())) {
          mismatches.push(`${blocker}: ${rest.length} vs ${direct.length}`);
        }
      }
      expect(mismatches).toEqual([]);
    });

    it("agrees on both directions of a block", async () => {
      const mismatches: string[] = [];
      for (const blocker of blockers) {
        const [rest, direct] = await Promise.all([
          viaRest.blockRelatedUserIds(blocker),
          viaSql.blockRelatedUserIds(blocker),
        ]);
        if (canonical([...rest].sort()) !== canonical([...direct].sort())) {
          mismatches.push(`${blocker}: ${rest.length} vs ${direct.length}`);
        }
      }
      expect(mismatches).toEqual([]);
    });

    it("agrees on which posts credit an excluded co-author", async () => {
      const posts = await executor.query<{ id: string }>(
        `select post_id::text as id from public.post_authors
         where accepted_at is not null limit 40`
      );
      const authors = await executor.query<{ id: string }>(
        `select user_id::text as id from public.post_authors
         where accepted_at is not null group by user_id limit 10`
      );
      if (posts.length === 0 || authors.length === 0) return;

      const postIds = posts.map((row) => row.id);
      const authorIds = authors.map((row) => row.id);

      const [rest, direct] = await Promise.all([
        viaRest.postIdsWithAuthors(postIds, authorIds),
        viaSql.postIdsWithAuthors(postIds, authorIds),
      ]);

      expect(canonical([...rest].sort())).toBe(canonical([...direct].sort()));
    });

    it("agrees on a blocked pair, in both directions", async () => {
      const edges = await executor.query<{ a: string; b: string }>(
        `select blocker_id::text as a, blocked_id::text as b
         from public.user_blocks limit 5`
      );

      const mismatches: string[] = [];
      for (const edge of edges) {
        for (const [left, right] of [
          [edge.a, edge.b],
          [edge.b, edge.a],
        ]) {
          const [rest, direct] = await Promise.all([
            viaRest.isBlockedPair(left, right),
            viaSql.isBlockedPair(left, right),
          ]);
          if (rest !== direct) {
            // No ids in the message: a mismatch is reported by position, not
            // by naming who blocked whom.
            mismatches.push(`pair ${edges.indexOf(edge)}: ${rest} vs ${direct}`);
          }
        }
      }
      expect(mismatches).toEqual([]);
    });

    it("agrees that an unrelated pair is not blocked", async () => {
      const members = await executor.query<{ id: string }>(
        `select p.id::text as id from public.profiles p
         where not exists (
           select 1 from public.user_blocks b
           where b.blocker_id = p.id or b.blocked_id = p.id
         )
         limit 2`
      );
      if (members.length < 2) return;

      const [rest, direct] = await Promise.all([
        viaRest.isBlockedPair(members[0].id, members[1].id),
        viaSql.isBlockedPair(members[0].id, members[1].id),
      ]);

      // A check that answers "blocked" for everyone would pass every other
      // assertion here. This is the one that fails if it does.
      expect(rest).toBe(false);
      expect(direct).toBe(false);
    });
  }
);
