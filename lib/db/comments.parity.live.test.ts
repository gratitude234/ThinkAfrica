import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, compared
 * field by field, for the comment thread.
 *
 * LIVE SAME-DATABASE PARITY.
 *
 * Uses the anon key rather than the service role, for the same reason the
 * search harness does and more so: the whole comparison is about two policies.
 * A service-role read applies neither, so it would report every moderated
 * comment and every suspended commenter as a difference and call the correct
 * side wrong.
 *
 * READ ONLY on both sides.
 *
 * Run with:  node scripts/migration/comments-parity.mjs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(supabaseUrl && anonKey && directUrl);

const { createSupabaseCommentsRepository, createPostgresCommentsRepository } =
  await import("@/lib/db/comments");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { differences } from "@/lib/db/parityDiff";

import type { CommentsRepository } from "@/lib/db/comments";

vi.setConfig({ testTimeout: 180_000 });

const BASE = {
  viewerId: null as string | null,
  cursorCreatedAt: null as string | null,
  cursorUpvotes: null as number | null,
  limit: 21,
};

describe.skipIf(!enabled)("comments: PostgREST vs PostgreSQL, same database", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let viaRest: CommentsRepository;
  let viaSql: CommentsRepository;
  let posts: string[];

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
    viaRest = createSupabaseCommentsRepository(
      createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as never
    );

    sql = await open();
    const executor = adaptDriver(sql as never);
    viaSql = createPostgresCommentsRepository(executor);

    const rows = await executor.query<{ post_id: string }>(
      `select c.post_id::text as post_id
       from public.comments c
       where c.parent_id is null
       group by c.post_id order by count(*) desc limit 6`
    );
    posts = rows.map((row) => row.post_id);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("has threads to compare", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  for (const sort of ["new", "top"] as const) {
    it(`agrees on the first page under the ${sort} sort, in order`, async () => {
      const mismatches: string[] = [];
      for (const postId of posts) {
        const [rest, direct] = await Promise.all([
          viaRest.topLevel({ ...BASE, postId, sort }),
          viaSql.topLevel({ ...BASE, postId, sort }),
        ]);
        mismatches.push(
          ...differences(rest, direct).map((line) => `${postId}: ${line}`)
        );
      }
      expect(mismatches).toEqual([]);
    });

    it(`agrees on the second page under the ${sort} sort`, async () => {
      const mismatches: string[] = [];
      for (const postId of posts) {
        const first = await viaSql.topLevel({ ...BASE, postId, sort, limit: 3 });
        if (first.length < 3) continue;
        const cursor = first[first.length - 1];

        const next = {
          ...BASE,
          postId,
          sort,
          limit: 21,
          cursorCreatedAt: cursor.created_at,
          cursorUpvotes: sort === "top" ? cursor.upvotes : null,
        };

        const [rest, direct] = await Promise.all([
          viaRest.topLevel(next),
          viaSql.topLevel(next),
        ]);

        // The cursor is where the two transports expressed the same predicate
        // most differently: an or= filter on one side, a row comparison on the
        // other. If they disagree anywhere, it is here.
        mismatches.push(
          ...differences(rest, direct).map((line) => `${postId} page 2: ${line}`)
        );
      }
      expect(mismatches).toEqual([]);
    });
  }

  it("agrees on the replies, in order", async () => {
    const mismatches: string[] = [];
    for (const postId of posts) {
      const parents = await viaSql.topLevel({ ...BASE, postId, sort: "new" });
      const ids = parents.map((row) => row.id).slice(0, 10);
      if (ids.length === 0) continue;

      const [rest, direct] = await Promise.all([
        viaRest.replies(ids, null),
        viaSql.replies(ids, null),
      ]);
      mismatches.push(
        ...differences(rest, direct).map((line) => `${postId}: ${line}`)
      );
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on the visible comment count", async () => {
    const mismatches: string[] = [];
    for (const postId of posts) {
      const [rest, direct] = await Promise.all([
        viaRest.count(postId, null),
        viaSql.count(postId, null),
      ]);
      if (rest !== direct) {
        mismatches.push(`${postId}: ${rest} vs ${direct}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees on which comments a real voter has voted on", async () => {
    const executor = adaptDriver(sql as never);
    const votes = await executor.query<{ user_id: string }>(
      `select user_id::text as user_id from public.comment_votes
       group by user_id order by count(*) desc limit 3`
    );

    const mismatches: string[] = [];
    for (const voter of votes) {
      const ids = await executor.query<{ id: string }>(
        `select comment_id::text as id from public.comment_votes
         where user_id = $1::uuid limit 20`,
        [voter.user_id]
      );
      const commentIds = ids.map((row) => row.id);
      if (commentIds.length === 0) continue;

      const [rest, direct] = await Promise.all([
        viaRest.votedCommentIds(commentIds, voter.user_id),
        viaSql.votedCommentIds(commentIds, voter.user_id),
      ]);

      // comment_votes is USING (true), so the anon client sees the same rows.
      // Order is undefined on both sides.
      if (
        JSON.stringify([...rest].sort()) !== JSON.stringify([...direct].sort())
      ) {
        mismatches.push(`${voter.user_id}: ${rest.length} vs ${direct.length}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
