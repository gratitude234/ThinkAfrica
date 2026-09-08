import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * PostgREST and PostgreSQL, reading the SAME production database, compared
 * field by field.
 *
 * This is the check that only exists at this stage of the migration, and it is
 * the strongest one available: both sides see identical rows at the same
 * instant, so any difference is a difference in the query, not in the data.
 * The Neon comparison could never say that, because Neon is a copy taken at a
 * different time.
 *
 * READ ONLY on both sides.
 *
 * Run with:  node scripts/migration/postpage-parity.mjs
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const directUrl = process.env.SUPABASE_DIRECT_URL;
const enabled = Boolean(supabaseUrl && serviceKey && directUrl);

const { createSupabasePostPageRepository, createPostgresPostPageRepository } =
  await import("@/lib/db/postPage");
const { adaptDriver } = await import("@/lib/db/postgres/executor");

import type { PostPageRepository } from "@/lib/db/postPage";

/** Sorted, so an ordering difference in a set-valued result is not reported as
 *  a content difference. Ordering is asserted separately where it matters. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b)
        )
      );
    }
    return entry;
  });
}

/** Timestamps: PostgREST returns `+00:00`, a driver returns a Date the mapper
 *  serialises as `Z`. Same instant, different spelling. */
function sameInstant(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  const left = new Date(a as string).getTime();
  const right = new Date(b as string).getTime();
  return Number.isNaN(left) || Number.isNaN(right)
    ? String(a) === String(b)
    : left === right;
}

const TIMESTAMP_KEYS = new Set([
  "created_at",
  "published_at",
  "accepted_at",
  "assigned_at",
  "submitted_at",
]);

/** Field-by-field, with the two known-benign spellings reconciled. */
function differences(left: unknown, right: unknown, path = ""): string[] {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return [`${path}: array on one side only`];
    }
    if (left.length !== right.length) {
      return [`${path}: length ${left.length} vs ${right.length}`];
    }
    return left.flatMap((entry, index) =>
      differences(entry, right[index], `${path}[${index}]`)
    );
  }

  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([
      ...Object.keys(left as object),
      ...Object.keys(right as object),
    ]);
    return [...keys].flatMap((key) =>
      differences(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      )
    );
  }

  const key = path.split(".").pop() ?? "";
  if (TIMESTAMP_KEYS.has(key.replace(/\[\d+\]$/, ""))) {
    return sameInstant(left, right) ? [] : [`${path}: ${left} vs ${right}`];
  }

  if ((left ?? null) !== (right ?? null)) {
    return [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`];
  }
  return [];
}

describe.skipIf(!enabled)("post page: PostgREST vs PostgreSQL, same database", () => {
  let sql: Awaited<ReturnType<typeof open>>;
  let viaRest: PostPageRepository;
  let viaSql: PostPageRepository;
  let cases: Array<{ id: string; tags: string[]; publishedAt: string | null }>;

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
    viaRest = createSupabasePostPageRepository(
      createClient(supabaseUrl!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as never
    );

    sql = await open();
    viaSql = createPostgresPostPageRepository(adaptDriver(sql as never));

    // A spread of real posts: with references, with co-authors, with reviews,
    // with responses, and a plain one. A parity run over five identical
    // published essays proves the easy half.
    const rows = await sql.unsafe(`
      (select id::text as id, to_jsonb(tags) as tags, published_at from public.posts
         where status='published' and id in (select post_id from public.post_references) limit 2)
      union all
      (select id::text, to_jsonb(tags), published_at from public.posts
         where status='published' and id in (select post_id from public.post_authors) limit 2)
      union all
      (select id::text, to_jsonb(tags), published_at from public.posts
         where status='published' and id in (select post_id from public.post_reviews) limit 2)
      union all
      (select id::text, to_jsonb(tags), published_at from public.posts
         where status='published' and in_response_to is not null limit 2)
      union all
      (select id::text, to_jsonb(tags), published_at from public.posts
         where status='published' order by published_at desc limit 3)
    `);

    const seen = new Set<string>();
    cases = [];
    for (const row of rows as unknown as Array<Record<string, unknown>>) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      cases.push({
        id,
        tags: (row.tags as string[]) ?? [],
        publishedAt: row.published_at
          ? new Date(row.published_at as string).toISOString()
          : null,
      });
    }

    expect(cases.length, "no published posts to compare").toBeGreaterThan(0);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("returns identical counts", async () => {
    const mismatches: string[] = [];
    for (const testCase of cases) {
      const [rest, direct] = await Promise.all([
        viaRest.counts(testCase.id),
        viaSql.counts(testCase.id),
      ]);
      mismatches.push(
        ...differences(rest, direct, testCase.id).map((entry) => `counts ${entry}`)
      );
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  }, 300_000);

  it("returns identical collections, in the same order", async () => {
    const mismatches: string[] = [];
    for (const testCase of cases) {
      const [rest, direct] = await Promise.all([
        viaRest.collections(testCase.id),
        viaSql.collections(testCase.id),
      ]);

      // Ordering is part of the contract for references, co-authors,
      // decisions and versions, so these are compared positionally.
      for (const key of ["references", "coAuthors", "decisions", "versions"] as const) {
        mismatches.push(
          ...differences(rest[key], direct[key], `${testCase.id}.${key}`)
        );
      }

      // Reviews have no ORDER BY on either side, so only the set is defined.
      const sortReviews = (list: unknown[]) =>
        [...list].sort((a, b) => canonical(a).localeCompare(canonical(b)));
      mismatches.push(
        ...differences(
          sortReviews(rest.reviews),
          sortReviews(direct.reviews),
          `${testCase.id}.reviews`
        )
      );
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  }, 300_000);

  it("returns identical related posts", async () => {
    const mismatches: string[] = [];
    for (const testCase of cases) {
      if (testCase.tags.length === 0) continue;
      const [rest, direct] = await Promise.all([
        viaRest.related(testCase.id, testCase.tags, 3),
        viaSql.related(testCase.id, testCase.tags, 3),
      ]);

      // `published_at desc` can tie, and neither side promises a tiebreak, so
      // the set is compared rather than the order.
      const ids = (list: Array<{ id: string }>) => list.map((e) => e.id).sort();
      if (canonical(ids(rest)) !== canonical(ids(direct))) {
        mismatches.push(
          `${testCase.id} related: ${ids(rest).join(",")} vs ${ids(direct).join(",")}`
        );
        continue;
      }

      const byId = new Map(direct.map((entry) => [entry.id, entry]));
      for (const entry of rest) {
        mismatches.push(
          ...differences(entry, byId.get(entry.id), `${testCase.id}.related.${entry.id}`)
        );
      }
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  }, 300_000);

  it("returns identical neighbours", async () => {
    const mismatches: string[] = [];
    for (const testCase of cases) {
      if (!testCase.publishedAt) continue;
      const [rest, direct] = await Promise.all([
        viaRest.neighbours(testCase.id, testCase.publishedAt),
        viaSql.neighbours(testCase.id, testCase.publishedAt),
      ]);
      mismatches.push(
        ...differences(rest, direct, `${testCase.id}.neighbours`)
      );
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  }, 300_000);

  it("returns identical parent posts, including the unpublished refusal", async () => {
    const mismatches: string[] = [];
    for (const testCase of cases.slice(0, 5)) {
      const [rest, direct] = await Promise.all([
        viaRest.parentPost(testCase.id),
        viaSql.parentPost(testCase.id),
      ]);
      mismatches.push(...differences(rest, direct, `${testCase.id}.parent`));
    }

    // An unpublished post must be refused by both.
    const rows = await sql.unsafe(
      "select id::text as id from public.posts where status <> 'published' limit 1"
    );
    if (rows.length > 0) {
      const id = String((rows[0] as Record<string, unknown>).id);
      const [rest, direct] = await Promise.all([
        viaRest.parentPost(id),
        viaSql.parentPost(id),
      ]);
      if (rest !== null || direct !== null) {
        mismatches.push(`unpublished parent leaked: ${canonical(rest)} vs ${canonical(direct)}`);
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  }, 300_000);

  it("returns identical viewer state", async () => {
    const rows = await sql.unsafe(
      `select l.user_id::text as viewer, l.post_id::text as post, p.author_id::text as author
       from public.likes as l join public.posts as p on p.id = l.post_id limit 3`
    );

    const mismatches: string[] = [];
    for (const row of rows as unknown as Array<Record<string, unknown>>) {
      const [rest, direct] = await Promise.all([
        viaRest.viewerState(String(row.post), String(row.viewer), String(row.author)),
        viaSql.viewerState(String(row.post), String(row.viewer), String(row.author)),
      ]);
      mismatches.push(...differences(rest, direct, `${row.post}.viewer`));
      // A row that exists in `likes` must read as liked on both sides, or the
      // comparison is agreeing on the wrong answer.
      if (!rest.liked) mismatches.push(`${row.post}: PostgREST says not liked`);
      if (!direct.liked) mismatches.push(`${row.post}: PostgreSQL says not liked`);
    }
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  }, 300_000);
});

describe.skipIf(enabled)("post page: PostgREST vs PostgreSQL, same database", () => {
  it("is skipped without both connections", () => {
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
      !directUrl && "SUPABASE_DIRECT_URL (the pooled Supabase Postgres connection)",
    ].filter(Boolean);
    console.info(`[postPage parity] not run. Missing: ${missing.join(", ")}`);
    expect(missing.length).toBeGreaterThan(0);
  });
});
