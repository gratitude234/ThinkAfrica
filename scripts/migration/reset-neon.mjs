/**
 * Drops and recreates the application schemas on the Neon SCRATCH database.
 *
 *   node scripts/migration/reset-neon.mjs --yes
 *
 * The pipeline has to be re-runnable. A restore that fails halfway leaves a
 * partially populated database, and the only honest response is to start from
 * empty rather than to hand-patch the difference: a database reached by manual
 * repair is one nobody can reproduce, which is exactly what Phase 3 is
 * supposed to rule out.
 *
 * ## Safety
 *
 * This is the only destructive script in the migration set, so it refuses more
 * than it accepts:
 *
 *   1. It uses DATABASE_URL_DIRECT and nothing else. There is no flag to point
 *      it somewhere else.
 *   2. It refuses any host that is not `*.neon.tech`. Supabase, localhost and
 *      anything unrecognised are rejected before a connection is opened.
 *   3. It refuses a database holding more rows than a scratch copy plausibly
 *      would, unless `--force` is given. A scratch database that has quietly
 *      become something else should not be silently emptied.
 *   4. It requires `--yes`.
 */
import postgres from "postgres";
import { loadEnv, redact, requireUrl } from "./env.mjs";

loadEnv();

const url = requireUrl("DATABASE_URL_DIRECT");
const host = new URL(url).hostname;

if (!host.endsWith(".neon.tech")) {
  console.error(
    "REFUSED: DATABASE_URL_DIRECT does not point at Neon.\n" +
      "  This script only ever resets the Neon scratch database."
  );
  process.exit(2);
}

if (!process.argv.includes("--yes")) {
  console.error(
    "This drops and recreates the public, private and auth schemas on the Neon\n" +
      "scratch database, and everything in them.\n\n" +
      "  node scripts/migration/reset-neon.mjs --yes\n"
  );
  process.exit(2);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 120_000 },
  onnotice: () => {},
});

try {
  const [{ count: tables }] = await sql`
    select count(*)::int as count from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname in ('public', 'private')`;

  // A rough size check. The Indegenius application data is about 28 MB; an
  // order of magnitude more means this is not the scratch copy any more.
  const [{ bytes }] = await sql`
    select coalesce(sum(pg_total_relation_size(c.oid)), 0)::bigint as bytes
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'private')`;

  const megabytes = Number(bytes) / 1024 / 1024;
  console.log(`current contents: ${tables} tables, ${megabytes.toFixed(0)} MB`);

  if (megabytes > 500 && !process.argv.includes("--force")) {
    console.error(
      `REFUSED: ${megabytes.toFixed(0)} MB is far larger than a scratch copy of\n` +
        "  this application (about 28 MB). Pass --force only if you are certain."
    );
    process.exit(2);
  }

  // CASCADE removes the policies, triggers, functions, views and constraints
  // with the tables, which is the whole point: a rule-by-rule teardown would
  // have its own ordering bugs.
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await sql.unsafe("DROP SCHEMA IF EXISTS private CASCADE");
  await sql.unsafe("DROP SCHEMA IF EXISTS auth CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.unsafe("CREATE SCHEMA private");

  console.log("dropped and recreated: public, private, auth");
  console.log("\nNext:");
  console.log("  psql -f scripts/migration/neon-preflight.sql   (Part A)");
  console.log("  node scripts/migration/apply-schema.mjs");
} catch (error) {
  console.error(redact(error));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
