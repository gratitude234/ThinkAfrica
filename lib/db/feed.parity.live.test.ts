import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, compared
 * field by field, for the feed.
 *
 * LIVE SAME-DATABASE PARITY. Both sides see identical rows at the same
 * instant, so a difference is a difference in the query rather than in the
 * data.
 *
 * ## Which client, and why it is the service role here
 *
 * `fetchFeedPage` builds its reader from `SUPABASE_SERVICE_ROLE_KEY`, which is
 * set in production. RLS has therefore never applied to these queries, and the
 * service role is not a shortcut for the harness: it is what production uses.
 * The queries filter `status = 'published'` themselves, which is what keeps
 * unpublished work out.
 *
 * That is the opposite of the search and comments harnesses, which use the
 * anon key precisely because those reads *are* governed by a policy. Choosing
 * the wrong one in either direction produces a comparison that means nothing.
 *
 * READ ONLY on both sides.
 *
 * Run with:  node scripts/migration/feed-parity.mjs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(supabaseUrl && serviceKey && directUrl);

const { createSupabaseFeedListRepository, createPostgresFeedListRepository } =
  await import("@/lib/db/feedList");
const { createSupabaseFeedRepository, createPostgresFeedRepository } =
  await import("@/lib/db/feed");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import { canonical, differences } from "@/lib/db/parityDiff";

import type { FeedListCriteria, FeedListRepository } from "@/lib/db/feedList";
import type { FeedRepository } from "@/lib/db/feed";

vi.setConfig({ testTimeout: 180_000 });

const BASE: FeedListCriteria = {
  contentKind: null,
  cutoff: null,
  authorIds: null,
  excludedAuthorIds: [],
  excludedPostIds: [],
  cursor: null,
  offset: 0,
  limit: 12,
};

describe.skipIf(!enabled)("feed: PostgREST vs PostgreSQL, same database", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let listRest: FeedListRepository;
  let listSql: FeedListRepository;
  let hydrateRest: FeedRepository;
  let hydrateSql: FeedRepository;

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

    listRest = createSupabaseFeedListRepository(client);
    hydrateRest = createSupabaseFeedRepository(client);

    sql = await open();
    const executor = adaptDriver(sql as never);
    listSql = createPostgresFeedListRepository(executor);
    hydrateSql = createPostgresFeedRepository(executor);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  async function compare(label: string, criteria: Partial<FeedListCriteria>) {
    const input = { ...BASE, ...criteria };
    const [rest, direct] = await Promise.all([
      listRest.listPosts(input),
      listSql.listPosts(input),
    ]);
    return differences(rest, direct).map((line) => `${label}: ${line}`);
  }

  it("agrees on an unrestricted page, in order", async () => {
    expect(await compare("unrestricted", {})).toEqual([]);
  });

  it("agrees with a content kind, a cutoff and a limit", async () => {
    const executor = adaptDriver(sql as never);
    const [kind] = await executor.query<{ content_kind: string }>(
      `select content_kind from public.posts
       where status = 'published' and content_kind is not null limit 1`
    );

    const mismatches: string[] = [];
    if (kind) {
      mismatches.push(
        ...(await compare("kind", { contentKind: kind.content_kind, limit: 30 }))
      );
    }
    mismatches.push(
      ...(await compare("cutoff", {
        cutoff: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
        limit: 30,
      }))
    );
    expect(mismatches).toEqual([]);
  });

  it("agrees on the following tab's author restriction", async () => {
    const executor = adaptDriver(sql as never);
    const authors = await executor.query<{ id: string }>(
      `select author_id::text as id from public.posts
       where status = 'published' and author_id is not null
       group by author_id order by count(*) desc limit 3`
    );
    if (authors.length === 0) return;

    expect(
      await compare("authorIds", {
        authorIds: authors.map((row) => row.id),
        limit: 30,
      })
    ).toEqual([]);
  });

  it("agrees on the keyset cursor, where the two transports differ most", async () => {
    const first = await listSql.listPosts({ ...BASE, limit: 5 });
    if (first.length < 5) return;
    const last = first[first.length - 1];
    if (!last.published_at) return;

    // An or= filter on one side, a row comparison on the other. If they
    // disagree anywhere, it is here.
    expect(
      await compare("cursor", {
        cursor: { publishedAt: last.published_at, id: last.id },
        limit: 12,
      })
    ).toEqual([]);
  });

  it("agrees on the date-ordered tail's offset", async () => {
    expect(await compare("offset", { offset: 12, limit: 13 })).toEqual([]);
  });

  it("agrees on the exclusions, including a post with no author", async () => {
    const seed = await listSql.listPosts({ ...BASE, limit: 5 });
    const authors = seed
      .map((row) => row.author_id)
      .filter((id): id is string => Boolean(id));
    const posts = seed.map((row) => row.id);
    if (authors.length === 0) return;

    const mismatches = [
      ...(await compare("excludedAuthors", {
        excludedAuthorIds: authors,
        limit: 30,
      })),
      ...(await compare("excludedPosts", { excludedPostIds: posts, limit: 30 })),
    ];
    expect(mismatches).toEqual([]);
  });

  it("agrees on the excluded-credit lookup", async () => {
    const executor = adaptDriver(sql as never);
    const authors = await executor.query<{ id: string }>(
      `select a.user_id::text as id from public.post_authors a
       where a.accepted_at is not null group by a.user_id limit 5`
    );
    if (authors.length === 0) return;

    const ids = authors.map((row) => row.id);
    const [rest, direct] = await Promise.all([
      listRest.postIdsCreditedTo(ids),
      listSql.postIdsCreditedTo(ids),
    ]);

    expect(canonical([...rest].sort())).toBe(canonical([...direct].sort()));
  });

  it("agrees on the hydration for a real page of posts", async () => {
    const page = await listSql.listPosts({ ...BASE, limit: 8 });
    const ids = page.map((row) => row.id);
    const authors = page
      .map((row) => row.author_id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;

    const [rest, direct] = await Promise.all([
      hydrateRest.hydrate({ postIds: ids, authorIds: authors, viewer: { id: null } }),
      hydrateSql.hydrate({ postIds: ids, authorIds: authors, viewer: { id: null } }),
    ]);

    // Keyed by an explicit accessor rather than by guessing at a field name.
    // The previous helper read post_id ?? id, and FeedPostCounts has neither:
    // its key is postId. Every row therefore collapsed onto the single key
    // "undefined", so the comparison checked one arbitrary row and passed.
    const byKey = <T>(rows: readonly T[], key: (row: T) => string) =>
      Object.fromEntries(rows.map((row) => [key(row), row]));

    expect(
      differences(
        byKey(rest.counts, (row) => row.postId),
        byKey(direct.counts, (row) => row.postId)
      )
    ).toEqual([]);
    expect(
      differences(
        byKey(rest.profiles, (row) => row.id),
        byKey(direct.profiles, (row) => row.id)
      )
    ).toEqual([]);
  });
});
