import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BEHAVIOURAL PROOF for the feed's post selection, against real PostgreSQL.
 *
 * The feed is the surface where a wrong query is least likely to look wrong.
 * Every assertion here is therefore about a restriction being applied rather
 * than about rows coming back: a filter that silently does nothing returns a
 * plausible feed, and a null parameter that accidentally matches nothing
 * returns an empty one.
 *
 * Read-only.
 */

const neonUrl = process.env.DATABASE_URL;
const enabled = Boolean(neonUrl && neonUrl.includes(".neon.tech"));

const { createPostgresFeedListRepository } = await import("@/lib/db/feedList");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { SqlExecutor } from "@/lib/db/postgres/executor";
import type { FeedListCriteria, FeedListRepository } from "@/lib/db/feedList";

vi.setConfig({ testTimeout: 60_000 });

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

describe.skipIf(!enabled)("the feed's selection against PostgreSQL", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let executor: SqlExecutor;
  let repository: FeedListRepository;

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
    repository = createPostgresFeedListRepository(executor);
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  // ── the unrestricted case ──────────────────────────────────────────

  it("returns published posts, newest first, honouring the limit", async () => {
    const rows = await repository.listPosts(BASE);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(12);

    const ids = rows.map((row) => row.id);
    const unpublished = await executor.query<{ id: string }>(
      `select id::text as id from public.posts
       where id in (select (jsonb_array_elements_text($1::text::jsonb))::uuid)
         and status <> 'published'`,
      [JSON.stringify(ids)]
    );
    expect(unpublished).toEqual([]);

    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      const left = previous.published_at ?? "";
      const right = current.published_at ?? "";
      expect(right <= left).toBe(true);
      if (right === left) expect(current.id < previous.id).toBe(true);
    }
  });

  it("returns tags as an array, never as a Postgres literal", async () => {
    for (const row of await repository.listPosts(BASE)) {
      if (row.tags !== null) expect(Array.isArray(row.tags)).toBe(true);
    }
  });

  it("omits topic_keys unless asked, and returns it as an array when asked", async () => {
    const without = await repository.listPosts(BASE);
    for (const row of without) expect(row.topic_keys).toBeUndefined();

    const withKeys = await repository.listPosts({
      ...BASE,
      includeTopicKeys: true,
    });
    for (const row of withKeys) {
      if (row.topic_keys != null) expect(Array.isArray(row.topic_keys)).toBe(true);
    }
  });

  // ── each restriction actually restricts ────────────────────────────

  it("filters by content kind", async () => {
    const [kind] = await executor.query<{ content_kind: string }>(
      `select content_kind from public.posts
       where status = 'published' and content_kind is not null limit 1`
    );
    if (!kind) return;

    const rows = await repository.listPosts({
      ...BASE,
      contentKind: kind.content_kind,
      limit: 30,
    });
    for (const row of rows) expect(row.content_kind).toBe(kind.content_kind);
  });

  it("applies the research exclusion sentinel", async () => {
    const [type] = await executor.query<{ type: string }>(
      `select type from public.posts where status = 'published' limit 1`
    );
    if (!type) return;

    const rows = await repository.listPosts({
      ...BASE,
      researchTypeExclusion: type.type,
      limit: 30,
    });
    expect(rows.some((row) => row.type === type.type)).toBe(false);
  });

  it("applies the timeframe cutoff", async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const rows = await repository.listPosts({ ...BASE, cutoff, limit: 30 });
    for (const row of rows) {
      expect(row.published_at).not.toBeNull();
      expect(Date.parse(row.published_at!)).toBeGreaterThanOrEqual(
        Date.parse(cutoff)
      );
    }
  });

  it("restricts to the given authors", async () => {
    const [author] = await executor.query<{ id: string }>(
      `select author_id::text as id from public.posts
       where status = 'published' and author_id is not null
       group by author_id order by count(*) desc limit 1`
    );
    if (!author) return;

    const rows = await repository.listPosts({
      ...BASE,
      authorIds: [author.id],
      limit: 30,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.author_id).toBe(author.id);
  });

  it("keeps posts credited to a subscribed co-author, without duplicating them", async () => {
    const [credit] = await executor.query<{ user_id: string }>(
      `select a.user_id::text as user_id
       from public.post_authors a
       join public.posts p on p.id = a.post_id
       where a.accepted_at is not null and p.status = 'published'
       group by a.user_id order by count(*) desc limit 1`
    );
    if (!credit) return;

    const rows = await repository.listPosts({
      ...BASE,
      coauthorUserIds: [credit.user_id],
      limit: 30,
    });
    expect(rows.length).toBeGreaterThan(0);

    // An inner embed keeps a post when a credit matches; it does not multiply
    // the post by its credits. A join here instead of an exists would return
    // the same article twice.
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });

  it("keeps only posts whose topics overlap", async () => {
    const [row] = await executor.query<{ key: string }>(
      `select k as key from public.posts p, unnest(p.topic_keys) as k
       where p.status = 'published' limit 1`
    );
    if (!row) return;

    const rows = await repository.listPosts({
      ...BASE,
      topicKeys: [row.key],
      includeTopicKeys: true,
      limit: 30,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const post of rows) {
      expect(post.topic_keys ?? []).toContain(row.key);
    }
  });

  it("keeps only citable posts when asked", async () => {
    const rows = await repository.listPosts({
      ...BASE,
      requireCitation: true,
      limit: 30,
    });
    for (const row of rows) expect(row.citation_id).not.toBeNull();
  });

  it("excludes blocked authors", async () => {
    const first = await repository.listPosts({ ...BASE, limit: 5 });
    const excluded = first
      .map((row) => row.author_id)
      .filter((id): id is string => Boolean(id));
    if (excluded.length === 0) return;

    const rows = await repository.listPosts({
      ...BASE,
      excludedAuthorIds: excluded,
      limit: 30,
    });
    for (const row of rows) expect(excluded).not.toContain(row.author_id);
  });

  it("excludes specific posts", async () => {
    const first = await repository.listPosts({ ...BASE, limit: 5 });
    const excluded = first.map((row) => row.id);
    if (excluded.length === 0) return;

    const rows = await repository.listPosts({
      ...BASE,
      excludedPostIds: excluded,
      limit: 30,
    });
    for (const row of rows) expect(excluded).not.toContain(row.id);
  });

  it("keeps a post whose author is null when authors are excluded", async () => {
    // `not in` over a null column is null, which excludes the row. The feed
    // has posts with no author_id, and dropping them silently would be a
    // change nobody asked for.
    const [orphan] = await executor.query<{ n: string }>(
      `select count(*) as n from public.posts
       where status = 'published' and author_id is null`
    );
    if (Number(orphan.n) === 0) return;

    const rows = await repository.listPosts({
      ...BASE,
      excludedAuthorIds: ["00000000-0000-0000-0000-000000000000"],
      limit: 200,
    });
    expect(rows.some((row) => row.author_id === null)).toBe(true);
  });

  // ── null means "no restriction", not "match nothing" ───────────────

  it("treats every absent restriction as no restriction", async () => {
    const unrestricted = await repository.listPosts({ ...BASE, limit: 50 });
    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.posts where status = 'published'`
    );

    // The failure this catches is a predicate written so that a null
    // parameter matches nothing. The feed would come back empty and look like
    // a database with no posts in it.
    expect(unrestricted.length).toBe(Math.min(Number(n), 50));
  });

  // ── the keyset cursor ──────────────────────────────────────────────

  it("pages without repeating or skipping a post", async () => {
    const first = await repository.listPosts({ ...BASE, limit: 5 });
    if (first.length < 5) return;
    const last = first[first.length - 1];
    if (!last.published_at) return;

    const second = await repository.listPosts({
      ...BASE,
      limit: 5,
      cursor: { publishedAt: last.published_at, id: last.id },
    });

    expect(second.filter((row) => first.some((o) => o.id === row.id))).toEqual([]);

    const [{ n }] = await executor.query<{ n: string }>(
      `select count(*) as n from public.posts
       where status = 'published'
         and (published_at, id) < ($1::timestamptz, $2::uuid)`,
      [last.published_at, last.id]
    );

    // The pair comparison is what stops posts sharing a timestamp from
    // repeating or vanishing across a page boundary.
    expect(second.length).toBe(Math.min(Number(n), 5));
  });

  it("returns the first page when there is no cursor", async () => {
    const rows = await repository.listPosts({ ...BASE, limit: 3 });
    expect(rows.length).toBeGreaterThan(0);
  });

  // ── ordering and paging ────────────────────────────────────────────

  it("orders by read count first under the well-read ordering", async () => {
    const rows = await repository.listPosts({
      ...BASE,
      order: "well_read",
      limit: 20,
    });
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i].read_count ?? 0).toBeLessThanOrEqual(
        rows[i - 1].read_count ?? 0
      );
    }
  });

  it("offsets without overlapping the previous page", async () => {
    const first = await repository.listPosts({ ...BASE, limit: 5 });
    const second = await repository.listPosts({ ...BASE, offset: 5, limit: 5 });
    expect(second.filter((row) => first.some((o) => o.id === row.id))).toEqual([]);
  });

  // ── failure behaviour ──────────────────────────────────────────────

  it("throws on a database failure rather than reporting an empty feed", async () => {
    const broken = createPostgresFeedListRepository({
      query: async () => {
        throw new Error("connection reset");
      },
    });
    await expect(broken.listPosts(BASE)).rejects.toThrow("connection reset");
  });
});
