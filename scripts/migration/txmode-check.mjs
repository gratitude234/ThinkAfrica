/**
 * Can the current credentials authenticate on the transaction-mode pooler?
 *
 *   node scripts/migration/txmode-check.mjs
 *
 * READ ONLY. Prints no credential.
 *
 * ## Why this is its own check
 *
 * `supabase-health.mjs` proves the *session-mode* pooler on 5432, which is what
 * the migration scripts use. Production's `DATABASE_URL` points at
 * *transaction mode* on 6543, which is a different listener with its own
 * tenant lookup, and `lib/db/postgres/connection.ts` is configured for it
 * (`prepare: false`, because transaction mode reuses backends between
 * statements and named prepared statements do not survive that).
 *
 * So session mode answering does not establish that a migrated read will
 * connect. This runs the query shapes the repositories actually use against
 * 6543 before a domain is enabled, because the alternative way to discover a
 * 28P01 there is a production 503.
 *
 * What it cannot tell you is whether Vercel's stored `DATABASE_URL` carries
 * *these* credentials. A password rotation invalidates the copy held anywhere
 * that did not get the new one. This proves the credentials in `.env.local`
 * work on 6543; the canary header proves production is using a working one.
 */
import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const resolved = await resolveSupabaseUrl(postgres);
const url = new URL(resolved.url);

if (url.port === "6543") {
  console.log("Resolved URL is already transaction mode.");
} else {
  console.log(`Session mode resolved on :${url.port}. Switching to :6543.`);
  url.port = "6543";
}
console.log(`host: ${url.hostname}:${url.port}\n`);

// Exactly the options production uses. Anything looser would prove less.
const sql = postgres(url.toString(), {
  max: 5,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 15,
  fetch_types: false,
  onnotice: () => {},
  connection: { statement_timeout: 8000 },
});

const checks = [];

/**
 * Every check is bounded. postgres.js keeps the event loop alive while a
 * connection is open, so a query that never settles produces no output at all
 * rather than a failure, which reads as the script hanging and tells you
 * nothing about the database.
 */
function within(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref()
    ),
  ]);
}

async function check(name, run) {
  const started = Date.now();
  try {
    const detail = await within(20_000, run());
    checks.push({ name, ok: true, ms: Date.now() - started, detail });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      ms: Date.now() - started,
      detail: error instanceof Error ? `${error.code ?? ""} ${error.message}`.trim() : String(error),
    });
  }
}

await check("authenticate", async () => {
  const [row] = await sql`select current_user as who`;
  return `as ${row.who}`;
});

await check("simple count", async () => {
  const [row] = await sql`
    select count(*)::int as n from public.posts where status = 'published'`;
  return `${row.n} published`;
});

await check("parameterised", async () => {
  const rows = await sql.unsafe(
    `select id::text as id from public.posts
      where status = $1 order by published_at desc nulls last limit $2`,
    ["published", 5]
  );
  return `${rows.length} rows`;
});

await check("jsonb aggregation", async () => {
  const [row] = await sql.unsafe(
    `select coalesce(jsonb_agg(jsonb_build_object('id', p.id)), '[]'::jsonb) as items
       from (select id from public.posts where status = $1 limit 3) p`,
    ["published"]
  );
  return Array.isArray(row.items) ? `${row.items.length} items` : "NOT AN ARRAY";
});

await check("text search, the search domain's shape", async () => {
  const rows = await sql.unsafe(
    `select id::text as id from public.posts
      where status = 'published' and title ilike $1 limit 5`,
    ["%a%"]
  );
  return `${rows.length} rows`;
});

await check("concurrency, 10 at once", async () => {
  await Promise.all(Array.from({ length: 10 }, () => sql`select 1 as x`));
  return "all returned";
});

await sql.end({ timeout: 5 }).catch(() => {});

for (const entry of checks) {
  console.log(
    `  ${entry.ok ? "PASS" : "FAIL"}  ${entry.name.padEnd(34)} ` +
      `${String(entry.ms).padStart(6)}ms  ${entry.detail}`
  );
}

const failed = checks.filter((entry) => !entry.ok);
if (failed.length === 0) {
  console.log(
    "\nTransaction mode accepts these credentials and every query shape the\n" +
      "repositories use. This does not prove Vercel holds the same credentials.\n"
  );
  process.exit(0);
}

const auth = failed.some((entry) => entry.detail.includes("28P01"));
console.log(
  auth
    ? "\n28P01 on 6543. These credentials are not valid for transaction mode.\n"
    : `\n${failed.length} check(s) failed on transaction mode.\n`
);
// Explicit, because an open pool would otherwise hold the process open after
// the report has already been printed.
process.exit(1);
