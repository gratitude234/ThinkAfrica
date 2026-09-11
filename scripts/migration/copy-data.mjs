/**
 * Copies application data from Supabase into the Neon scratch database.
 *
 *   node scripts/migration/copy-data.mjs
 *
 * Reads Supabase, writes Neon. Nothing about production changes.
 *
 * ## Triggers
 *
 * The obvious approach, `SET session_replication_role = replica`, is not
 * available: Neon refuses it for `neondb_owner`. `ALTER TABLE ... DISABLE
 * TRIGGER ALL` needs superuser for the same reason.
 *
 * What is available, because the connecting role owns the tables, is
 * `DISABLE TRIGGER USER`. That turns out to be the better tool rather than a
 * consolation:
 *
 *   - **Application triggers must not fire.** The points system awards on
 *     insert (`award_points_on_publish`, `award_points_on_like`,
 *     `award_points_on_comment`) and the counter tables are trigger-maintained.
 *     Loading a like whose points were already counted, into a profiles row
 *     that already carries them, would double every score in the product.
 *   - **Foreign keys must still fire.** `DISABLE TRIGGER ALL` would have
 *     switched off the constraint triggers too, turning a referential error
 *     into silently orphaned rows discovered much later. Leaving them on means
 *     the load itself proves the graph is intact.
 *
 * Keeping FK enforcement on requires loading parents before children, which is
 * exactly the order `pg_dump --data-only` already emits.
 *
 * The guard triggers (`guard_locked_post_write` and friends) would not have
 * fired anyway: each bypasses unless `current_user` is literally
 * `authenticated`, which no Neon role is. They are disabled with the rest
 * rather than relied on to bypass.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import {
  assertDumperNewerThan,
  loadEnv,
  redact,
  requireUrl,
  resolveSupabaseUrl,
} from "./env.mjs";
import { pgDump, psql } from "./pg.mjs";
import { EXCLUDED_TABLE_DATA } from "./policy.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const DATA = join(OUT, "data.sql");

loadEnv();

const neonUrl = requireUrl("DATABASE_URL_DIRECT");
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("REFUSED: DATABASE_URL_DIRECT does not point at Neon.");
  process.exit(2);
}

const { url: supabaseUrl, via } = await resolveSupabaseUrl(postgres);
console.log(`Supabase reached via: ${via}`);

const neon = postgres(neonUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 600_000 },
  onnotice: () => {},
});

async function tables() {
  const rows = await neon`
    select n.nspname as schema, c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public','private')
     order by 1, 2`;
  return rows.map((row) => `${row.schema}.${row.name}`);
}

async function setUserTriggers(enabled) {
  const list = await tables();
  for (const table of list) {
    await neon.unsafe(
      `ALTER TABLE ${table} ${enabled ? "ENABLE" : "DISABLE"} TRIGGER USER`
    );
  }
  return list.length;
}

/**
 * Makes every foreign key deferrable for the load, and puts it back after.
 *
 * `posts.published_version_id` references `post_versions`, and
 * `post_versions.post_id` references `posts`. That cycle has no load order:
 * whichever table goes first violates the other's key, which is why
 * `pg_dump`'s dependency ordering cannot help and the load fails on the first
 * published post.
 *
 * Deferring is the right answer rather than dropping the constraint, because
 * the check still happens: at COMMIT, over the whole dataset, with every row
 * present. Integrity is verified once instead of row by row, and a genuine
 * orphan still aborts the load.
 *
 * This is why the load runs as a single transaction. A deferred constraint in
 * an autocommit session is checked at the end of each statement, which is the
 * behaviour being avoided.
 */
async function setForeignKeysDeferrable(deferrable) {
  const constraints = await neon`
    select nsp.nspname as schema, rel.relname as table, con.conname as name
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where con.contype = 'f' and nsp.nspname in ('public','private')
     order by 1, 2, 3`;

  for (const row of constraints) {
    await neon.unsafe(
      `ALTER TABLE ${row.schema}.${row.table} ALTER CONSTRAINT ${row.name} ` +
        (deferrable ? "DEFERRABLE INITIALLY DEFERRED" : "NOT DEFERRABLE")
    );
  }
  return constraints.length;
}

try {
  // A non-empty target means a previous run half-finished. Refuse rather than
  // append: duplicate keys would fail noisily on some tables and succeed on
  // others, leaving a database nobody can characterise.
  const [{ n: existing }] = await neon`
    select coalesce(sum(c.reltuples), 0)::bigint as n
      from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
     where c.relkind = 'r' and nsp.nspname in ('public','private')`;
  const [{ n: actual }] = await neon`select count(*)::int as n from public.profiles`;
  if (actual > 0) {
    console.error(
      `\nREFUSED: the target already holds data (profiles has ${actual} rows).\n` +
        "  Start from empty so the result is reproducible:\n" +
        "    node scripts/migration/reset-neon.mjs --yes\n" +
        "    node scripts/migration/apply-schema.mjs\n" +
        "    node scripts/migration/copy-data.mjs\n"
    );
    process.exit(2);
  }
  void existing;

  // ---- dump -------------------------------------------------------------
  const probe = postgres(supabaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  const [{ num }] = await probe`select current_setting('server_version_num') as num`;
  await probe.end({ timeout: 5 }).catch(() => {});
  assertDumperNewerThan(Math.floor(Number(num) / 10000));

  console.log("\ndumping data (COPY format, dependency order) ...");
  const dump = pgDump(supabaseUrl, [
    "--data-only",
    "--schema=public",
    "--schema=private",
    "--no-owner",
    "--no-privileges",
    // COPY rather than INSERT is pg_dump's default and is what we want: an
    // order of magnitude faster, and the blocks are emitted so that parents
    // precede children.
    "--no-comments",
    // Schema migrates, data does not. See policy.mjs for why each one.
    ...EXCLUDED_TABLE_DATA.map((entry) => "--exclude-table-data=" + entry.table),
  ]);
  for (const entry of EXCLUDED_TABLE_DATA) {
    console.log("  data excluded: " + entry.table);
    console.log("    " + entry.reason);
  }
  if (dump.status !== 0) {
    console.error(`pg_dump exited ${dump.status}`);
    console.error(redact({ message: dump.stderr }));
    process.exit(dump.status);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(DATA, dump.stdout, "utf8");
  const copyBlocks = (dump.stdout.match(/^COPY /gm) ?? []).length;
  console.log(
    `  out/data.sql: ${(statSync(DATA).size / 1024 / 1024).toFixed(1)} MB, ${copyBlocks} COPY blocks`
  );

  // ---- load -------------------------------------------------------------
  const disabled = await setUserTriggers(false);
  console.log(`\ndisabled USER triggers on ${disabled} tables`);
  const deferred = await setForeignKeysDeferrable(true);
  console.log(`made ${deferred} foreign keys deferrable`);

  console.log("loading (single transaction) ...");
  // --single-transaction is what gives the deferral meaning, and it also means
  // a failure leaves the database exactly as empty as it started.
  const load = psql(neonUrl, ["--single-transaction", "-f", DATA]);
  const errors = load.stderr.split(/\r?\n/).filter((line) => /ERROR|FATAL/.test(line));

  // The restore has to run whether or not the load worked, or the database is
  // left with its triggers off. But it must not be allowed to *mask* a load
  // failure: it issues 126 DDL statements over one connection, and when that
  // connection drops the ECONNRESET propagates first and the load's own error
  // is never printed. That happened twice, and both times the visible symptom
  // was a network error while the real event was the load rolling back.
  let restoreError = null;
  console.log("restoring constraints and triggers ...");
  try {
    await setForeignKeysDeferrable(false);
    await setUserTriggers(true);
  } catch (error) {
    restoreError = error;
    console.error(
      `\n  restore step failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    console.error(
      "  Triggers and deferrable constraints may still be off. Re-run from\n" +
        "  reset-neon.mjs rather than repairing by hand."
    );
  }

  if (load.status !== 0 || errors.length > 0) {
    console.error(`\nload FAILED (exit ${load.status}, ${errors.length} SQL errors)`);
    for (const error of errors.slice(0, 20)) console.error(`  ${error}`);
    if (errors.length === 0) {
      // psql exits 2 when the connection went bad rather than when a statement
      // failed, and that produces no ERROR line. Printing the tail of stderr is
      // the difference between "the load failed" and knowing why.
      console.error("  no SQL error: psql exit 2 means the connection dropped.");
      console.error("  stderr tail:");
      for (const line of load.stderr.trim().split(/\r?\n/).slice(-10)) {
        console.error(`    ${redact({ message: line })}`);
      }
    }
    console.error(
      "\n  The transaction rolled back, so the target is unchanged. Retry with:\n" +
        "    node scripts/migration/copy-data.mjs"
    );
    process.exit(1);
  }

  // A load that worked but could not be sealed is not a usable database, and
  // saying "load ok" here would send the next step at a target whose triggers
  // are off.
  if (restoreError) {
    console.error("\nThe data loaded, but constraints and triggers were not restored.");
    console.error("Re-run from reset-neon.mjs.");
    process.exit(1);
  }

  console.log("load ok");

  const [{ n: profiles }] = await neon`select count(*)::int as n from public.profiles`;
  const [{ n: posts }] = await neon`select count(*)::int as n from public.posts`;
  console.log(`\nprofiles: ${profiles}, posts: ${posts}`);
  console.log("\nNext: node scripts/migration/reset-sequences.mjs");
} catch (error) {
  console.error(redact(error));
  process.exitCode = 1;
} finally {
  await neon.end({ timeout: 5 }).catch(() => {});
}
