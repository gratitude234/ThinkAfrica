import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the feed's hydration query, against real PostgreSQL.
 *
 * This is not live same-database parity. It proves the SQL does what the
 * PostgREST calls did: the right counter tables, the right fallbacks, the RLS
 * comment rule reproduced faithfully, and the shapes `enrichPosts` consumes.
 * Agreement with PostgREST on the same rows at the same instant is
 * `feed.parity.live.test.ts`, which needs Supabase reachable.
 *
 * Read-only except for transactions that are rolled back.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresFeedRepository } = await import("@/lib/db/feed");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { FeedRepository } from "@/lib/db/feed";

describe.skipIf(!enabled)("feed hydration against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: FeedRepository;

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
    repository = createPostgresFeedRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function somePosts(limit = 5) {
    return executor.query<{ id: string; author_id: string }>(
      `select id::text as id, author_id::text as author_id
       from public.posts where status = 'published' and author_id is not null
       order by published_at desc nulls last limit ${limit}`
    );
  }

  it("returns one count row per requested post, and no others", async () => {
    const posts = await somePosts();
    const ids = posts.map((p) => p.id);

    const { counts } = await repository.hydrate({
      postIds: ids,
      authorIds: [],
      viewer: { id: null },
    });

    expect(counts.map((c) => c.postId).sort()).toEqual([...ids].sort());
  }, 60_000);

  it("returns numbers, not int8 strings", async () => {
    const posts = await somePosts(3);
    const { counts } = await repository.hydrate({
      postIds: posts.map((p) => p.id),
      authorIds: [],
      viewer: { id: null },
    });

    for (const entry of counts) {
      for (const key of [
        "likeCount",
        "bookmarkCount",
        "referenceCount",
        "commentCount",
        "responseCount",
      ] as const) {
        expect(typeof entry[key], `${key} should be a number`).toBe("number");
      }
      expect(typeof entry.viewerLiked).toBe("boolean");
      expect(typeof entry.viewerBookmarked).toBe("boolean");
    }
  }, 60_000);

  it("takes the like count from the maintained aggregate, with no row fallback", async () => {
    // posts.like_count was dropped in 20260715000004 and post_like_counts has
    // been authoritative since. Counting `likes` instead would be a different
    // number, so this asserts the source rather than the value.
    const rows = await executor.query<{ id: string; like_count: string }>(
      `select post_id::text as id, like_count from public.post_like_counts
       where like_count > 0 limit 1`
    );
    if (rows.length === 0) return;

    const { counts } = await repository.hydrate({
      postIds: [rows[0].id],
      authorIds: [],
      viewer: { id: null },
    });
    expect(counts[0].likeCount).toBe(Number(rows[0].like_count));
  }, 60_000);

  it("falls back to counting rows when an aggregate has no row", async () => {
    const rows = await executor.query<{ id: string; direct: string }>(
      `select p.id::text as id,
              (select count(*) from public.post_references r where r.post_id = p.id) as direct
       from public.posts p
       where not exists (select 1 from public.post_reference_counts rc where rc.post_id = p.id)
         and exists (select 1 from public.post_references r where r.post_id = p.id)
       limit 1`
    );
    if (rows.length === 0) return;

    const { counts } = await repository.hydrate({
      postIds: [rows[0].id],
      authorIds: [],
      viewer: { id: null },
    });
    expect(counts[0].referenceCount).toBe(Number(rows[0].direct));
  }, 60_000);

  it("counts only published responses", async () => {
    const rows = await executor.query<{ id: string; published: string }>(
      `select p.id::text as id,
              (select count(*) from public.posts r
                where r.in_response_to = p.id and r.status = 'published') as published
       from public.posts p
       where exists (select 1 from public.posts r where r.in_response_to = p.id)
       limit 1`
    );
    if (rows.length === 0) return;

    const { counts } = await repository.hydrate({
      postIds: [rows[0].id],
      authorIds: [],
      viewer: { id: null },
    });
    expect(counts[0].responseCount).toBe(Number(rows[0].published));
  }, 60_000);

  it("hides a moderated comment from a stranger, shows it to its author", async () => {
    // The RLS SELECT policy on comments, which a direct connection does not
    // enforce and this SQL has to reproduce:
    //   (hidden_at IS NULL) OR (auth.uid() = author_id) OR is_admin()
    const posts = await somePosts(1);
    const profiles = await executor.query<{ id: string }>(
      `select id::text as id from public.profiles where coalesce(role,'') <> 'admin' limit 2`
    );
    if (posts.length === 0 || profiles.length < 2) return;

    const [post] = posts;
    const [author, stranger] = profiles;

    await sql
      .begin(async (tx) => {
        const txRepository = createPostgresFeedRepository(adaptDriver(tx as never));

        const before = await txRepository.hydrate({
          postIds: [post.id],
          authorIds: [],
          viewer: { id: stranger.id },
        });
        const baseline = before.counts[0].commentCount;

        await tx.unsafe(
          `insert into public.comments (post_id, author_id, content, hidden_at)
           values ($1::uuid, $2::uuid, $3::text, now())`,
          [post.id, author.id, "a moderated comment"]
        );

        const asStranger = await txRepository.hydrate({
          postIds: [post.id],
          authorIds: [],
          viewer: { id: stranger.id },
        });
        const asAuthor = await txRepository.hydrate({
          postIds: [post.id],
          authorIds: [],
          viewer: { id: author.id },
        });
        const loggedOut = await txRepository.hydrate({
          postIds: [post.id],
          authorIds: [],
          viewer: { id: null },
        });

        expect(asStranger.counts[0].commentCount, "hidden from a stranger").toBe(
          baseline
        );
        expect(loggedOut.counts[0].commentCount, "hidden from a reader").toBe(
          baseline
        );
        expect(asAuthor.counts[0].commentCount, "visible to its author").toBe(
          baseline + 1
        );

        throw new Error("__rollback__");
      })
      .catch((error: Error) => {
        if (error.message !== "__rollback__") throw error;
      });
  }, 180_000);

  it("shows a moderated comment to an admin", async () => {
    const posts = await somePosts(1);
    const admins = await executor.query<{ id: string }>(
      `select id::text as id from public.profiles where role = 'admin' limit 1`
    );
    const others = await executor.query<{ id: string }>(
      `select id::text as id from public.profiles where coalesce(role,'') <> 'admin' limit 1`
    );
    if (posts.length === 0 || admins.length === 0 || others.length === 0) return;

    await sql
      .begin(async (tx) => {
        const txRepository = createPostgresFeedRepository(adaptDriver(tx as never));
        const before = await txRepository.hydrate({
          postIds: [posts[0].id],
          authorIds: [],
          viewer: { id: admins[0].id },
        });

        await tx.unsafe(
          `insert into public.comments (post_id, author_id, content, hidden_at)
           values ($1::uuid, $2::uuid, $3::text, now())`,
          [posts[0].id, others[0].id, "a moderated comment"]
        );

        const after = await txRepository.hydrate({
          postIds: [posts[0].id],
          authorIds: [],
          viewer: { id: admins[0].id },
        });

        // is_admin() is inlined in the SQL rather than passed as a flag.
        expect(after.counts[0].commentCount).toBe(before.counts[0].commentCount + 1);

        throw new Error("__rollback__");
      })
      .catch((error: Error) => {
        if (error.message !== "__rollback__") throw error;
      });
  }, 180_000);

  it("reports viewer state only for the viewer", async () => {
    const rows = await executor.query<{ post: string; viewer: string }>(
      `select post_id::text as post, user_id::text as viewer from public.likes limit 1`
    );
    if (rows.length === 0) return;

    const mine = await repository.hydrate({
      postIds: [rows[0].post],
      authorIds: [],
      viewer: { id: rows[0].viewer },
    });
    expect(mine.counts[0].viewerLiked).toBe(true);

    const anonymous = await repository.hydrate({
      postIds: [rows[0].post],
      authorIds: [],
      viewer: { id: null },
    });
    expect(anonymous.counts[0].viewerLiked).toBe(false);
  }, 60_000);

  it("returns author profiles with the projection the cards use", async () => {
    const posts = await somePosts(3);
    const { profiles } = await repository.hydrate({
      postIds: posts.map((p) => p.id),
      authorIds: posts.map((p) => p.author_id),
      viewer: { id: null },
    });

    expect(profiles.length).toBeGreaterThan(0);
    for (const key of [
      "id",
      "username",
      "full_name",
      "university",
      "avatar_url",
      "verified",
      "verified_type",
    ]) {
      expect(profiles[0]).toHaveProperty(key);
    }
  }, 60_000);

  it("returns accepted co-authors only, ordered", async () => {
    const rows = await executor.query<{ id: string }>(
      `select post_id::text as id from public.post_authors
       where accepted_at is not null limit 1`
    );
    if (rows.length === 0) return;

    const { coAuthors } = await repository.hydrate({
      postIds: [rows[0].id],
      authorIds: [],
      viewer: { id: null },
    });

    expect(coAuthors.length).toBeGreaterThan(0);
    const orders = coAuthors.map((entry) => entry.display_order ?? 0);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);

    const [{ count }] = await executor.query<{ count: string }>(
      `select count(*)::int as count from public.post_authors
       where post_id = $1::uuid and accepted_at is not null`,
      [rows[0].id]
    );
    expect(coAuthors.length).toBe(Number(count));
  }, 60_000);

  it("returns empty structures for an empty request", async () => {
    const result = await repository.hydrate({
      postIds: [],
      authorIds: [],
      viewer: { id: null },
    });
    expect(result).toEqual({ counts: [], profiles: [], coAuthors: [] });
  }, 60_000);
});

describe.skipIf(enabled)("feed hydration against PostgreSQL", () => {
  it("is skipped without a PostgreSQL connection", () => {
    console.info("[feed] skipped: DATABASE_URL is not a PostgreSQL connection string.");
    expect(enabled).toBe(false);
  });
});
