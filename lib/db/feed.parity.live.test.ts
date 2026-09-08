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

/** Matches nothing, which is what the sentinel does when research is on. */
const NO_EXCLUSION = "__no_such_post_type__";

const BASE: FeedListCriteria = {
  researchTypeExclusion: NO_EXCLUSION,
  contentKind: null,
  cutoff: null,
  authorIds: null,
  coauthorUserIds: null,
  topicKeys: null,
  requireCitation: false,
  onlyResponses: false,
  excludedAuthorIds: [],
  excludedPostIds: [],
  cursor: null,
  order: "recent",
  includeTopicKeys: false,
  projection: "card",
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

  it("agrees on the well-read ordering and the citable arm", async () => {
    const mismatches = [
      ...(await compare("well_read", { order: "well_read", limit: 20 })),
      ...(await compare("citable", { requireCitation: true, limit: 20 })),
      ...(await compare("responses", { onlyResponses: true, limit: 20 })),
    ];
    expect(mismatches).toEqual([]);
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

  it("agrees on the topic-subscription arm", async () => {
    const executor = adaptDriver(sql as never);
    const [row] = await executor.query<{ key: string }>(
      `select k as key from public.posts p, unnest(p.topic_keys) as k
       where p.status = 'published' limit 1`
    );
    if (!row) return;

    expect(
      await compare("topicKeys", {
        topicKeys: [row.key],
        includeTopicKeys: true,
        limit: 30,
      })
    ).toEqual([]);
  });

  it("agrees on the co-author credit arm, credits included", async () => {
    const executor = adaptDriver(sql as never);
    const [credit] = await executor.query<{ user_id: string }>(
      `select a.user_id::text as user_id
       from public.post_authors a
       join public.posts p on p.id = a.post_id
       where a.accepted_at is not null and p.status = 'published'
       group by a.user_id order by count(*) desc limit 1`
    );
    if (!credit) return;

    const input = {
      ...BASE,
      coauthorUserIds: [credit.user_id],
      limit: 20,
    };
    const [rest, direct] = await Promise.all([
      listRest.listPostsWithCredits(input),
      listSql.listPostsWithCredits(input),
    ]);

    // The credit list is a set on both sides; PostgREST's embed order is not
    // defined and neither is jsonb_agg's without an ORDER BY.
    const index = (rows: typeof rest) =>
      Object.fromEntries(
        rows.map((row) => {
          const credits = Array.isArray(row.subscription_author_credits)
            ? row.subscription_author_credits
            : row.subscription_author_credits
              ? [row.subscription_author_credits]
              : [];
          return [
            row.id,
            {
              ...row,
              subscription_author_credits: [...credits].sort((a, b) =>
                String(a.user_id).localeCompare(String(b.user_id))
              ),
            },
          ];
        })
      );

    expect(rest.length).toBe(direct.length);
    expect(differences(index(rest), index(direct))).toEqual([]);
  });

  it("agrees on the ranked probe's narrow projection", async () => {
    const input = { ...BASE, projection: "identity" as const, limit: 20 };
    const [rest, direct] = await Promise.all([
      listRest.listPosts(input),
      listSql.listPosts(input),
    ]);

    // The projection is part of the contract: reading whole cards here would
    // be 160 rows of metadata fetched and dropped on every tail page.
    expect(differences(rest, direct)).toEqual([]);
    for (const row of direct) {
      expect(Object.keys(row).sort()).toEqual([
        "citation_id",
        "id",
        "published_at",
        "read_count",
      ]);
    }
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
      hydrateRest.hydrate({ postIds: ids, authorIds: authors, viewer: null }),
      hydrateSql.hydrate({ postIds: ids, authorIds: authors, viewer: null }),
    ]);

    const byId = <T extends { post_id?: string; id?: string }>(rows: T[]) =>
      Object.fromEntries(rows.map((row) => [row.post_id ?? row.id, row]));

    expect(differences(byId(rest.counts), byId(direct.counts))).toEqual([]);
    expect(differences(byId(rest.profiles), byId(direct.profiles))).toEqual([]);
  });
});
