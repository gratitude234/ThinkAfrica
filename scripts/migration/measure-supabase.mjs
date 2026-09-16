/**
 * Measure the live Supabase database, using postgres.js instead of psql.
 *
 * `dump-supabase-schema.sh` needs `pg_dump` and `psql`. Neither is installed on
 * every machine this repository is worked on, and the numbers it collects are
 * the input to the "dump-and-restore or logical replication" decision, so they
 * cannot wait for a client install. This script asks the same catalogue
 * questions over the driver the application is going to use anyway.
 *
 * READ-ONLY. Every statement is a SELECT against a catalogue or a statistics
 * view. It opens one connection, sets a short statement timeout, and writes
 * JSON and TSV into scripts/migration/out/.
 *
 *   SUPABASE_DB_URL='postgresql://...' node scripts/migration/measure-supabase.mjs
 *
 * Use the DIRECT connection string, not the pooled one: several of these read
 * session-scoped catalogue state, and a transaction pooler will not give a
 * stable view of it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv, redact, resolveSupabaseUrl } from "./env.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");

loadEnv();

let url;
let via;
try {
  // Reads .env.local, so nothing has to be exported by hand into a shell whose
  // history would then hold a connection string. Falls back to Supavisor
  // session mode when the direct host is IPv6-only and this machine is not.
  // See env.mjs.
  ({ url, via } = await resolveSupabaseUrl(postgres));
} catch (error) {
  console.error(redact(error));
  process.exit(2);
}

console.log(`Supabase reached via: ${via}`);

const sql = postgres(url, {
  max: 1,
  prepare: false,
  idle_timeout: 5,
  connect_timeout: 15,
  // Long enough for a catalogue scan on a large database, short enough that a
  // degraded instance fails rather than hanging. The outages this migration
  // exists to end looked exactly like a query that never came back.
  connection: { statement_timeout: 60_000 },
  onnotice: () => {},
});

/** Every question, as one named query. Adding one here adds it to the report
 *  and to the JSON, so the two cannot drift. */
const QUERIES = {
  version: sql`select version() as version, current_setting('server_version_num') as version_num`,

  database_size: sql`
    select pg_database_size(current_database()) as bytes,
           pg_size_pretty(pg_database_size(current_database())) as pretty`,

  schema_sizes: sql`
    select n.nspname as schema,
           count(*) filter (where c.relkind = 'r') as tables,
           coalesce(sum(pg_total_relation_size(c.oid)), 0) as bytes,
           pg_size_pretty(coalesce(sum(pg_total_relation_size(c.oid)), 0)) as pretty
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'm')
       and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
     group by n.nspname
     order by bytes desc`,

  table_sizes: sql`
    select n.nspname as schema,
           c.relname as table,
           c.reltuples::bigint as estimated_rows,
           s.n_live_tup as live_rows,
           pg_total_relation_size(c.oid) as total_bytes,
           pg_relation_size(c.oid) as heap_bytes,
           pg_indexes_size(c.oid) as index_bytes,
           pg_size_pretty(pg_total_relation_size(c.oid)) as total_pretty
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_stat_user_tables s on s.relid = c.oid
     where c.relkind = 'r'
       and n.nspname in ('public', 'private')
     order by pg_total_relation_size(c.oid) desc`,

  index_sizes: sql`
    select schemaname as schema, relname as table, indexrelname as index,
           pg_relation_size(indexrelid) as bytes,
           pg_size_pretty(pg_relation_size(indexrelid)) as pretty,
           idx_scan as scans
      from pg_stat_user_indexes
     where schemaname in ('public', 'private')
     order by pg_relation_size(indexrelid) desc
     limit 40`,

  policies: sql`
    select schemaname as schema, tablename as table, policyname as policy,
           cmd, roles::text as roles,
           coalesce(qual, '') as using_expr,
           coalesce(with_check, '') as check_expr
      from pg_policies
     where schemaname in ('public', 'private')
     order by schemaname, tablename, policyname`,

  functions: sql`
    select n.nspname as schema, p.proname as name,
           p.prosecdef as security_definer,
           pg_get_function_identity_arguments(p.oid) as args,
           coalesce(array_to_string(p.proconfig, ' '), '') as config,
           pg_get_functiondef(p.oid) ~* 'auth\\.(uid|role|jwt|users)' as touches_auth
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
     order by 1, 2`,

  triggers: sql`
    select event_object_schema as schema, event_object_table as table,
           trigger_name as name, action_timing as timing,
           string_agg(event_manipulation, ',') as events
      from information_schema.triggers
     where event_object_schema in ('public', 'private')
     group by 1, 2, 3, 4
     order by 1, 2, 3`,

  views: sql`
    select schemaname as schema, viewname as name, 'view' as kind
      from pg_views where schemaname in ('public', 'private')
    union all
    select schemaname, matviewname, 'materialized'
      from pg_matviews where schemaname in ('public', 'private')
     order by 1, 2`,

  extensions: sql`
    select e.extname as name, e.extversion as version, n.nspname as schema
      from pg_extension e join pg_namespace n on n.oid = e.extnamespace
     order by 1`,

  /** Foreign keys pointing out of public/private. These are the ones the Neon
   *  schema cannot keep as written. */
  external_foreign_keys: sql`
    select con.conrelid::regclass::text as from_table,
           con.conname as constraint,
           con.confrelid::regclass::text as to_table
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join pg_class frel on frel.oid = con.confrelid
      join pg_namespace fnsp on fnsp.oid = frel.relnamespace
     where con.contype = 'f'
       and nsp.nspname in ('public', 'private')
       and fnsp.nspname not in ('public', 'private')
     order by 1, 2`,

  rls_status: sql`
    select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_enabled,
           (select count(*) from pg_policies p
             where p.schemaname = n.nspname and p.tablename = c.relname) as policy_count
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public', 'private')
     order by 1, 2`,

  auth_users_count: sql`select count(*)::bigint as count from auth.users`,

  storage_objects: sql`
    select bucket_id, count(*)::bigint as objects, sum(coalesce((metadata->>'size')::bigint, 0)) as bytes
      from storage.objects group by bucket_id order by 2 desc`,
};

function toTsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) =>
    value === null || value === undefined
      ? ""
      : String(value).replace(/[\t\r\n]+/g, " ");
  return [
    columns.join("\t"),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join("\t")),
  ].join("\n");
}

function bytes(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "?";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let index = 0;
  let scaled = number;
  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }
  return `${scaled.toFixed(scaled < 10 && index > 0 ? 1 : 0)} ${units[index]}`;
}

const results = {};
const failures = {};

for (const [name, query] of Object.entries(QUERIES)) {
  try {
    results[name] = [...(await query)];
  } catch (error) {
    // A missing permission on auth/storage is expected on some roles and is
    // not a reason to lose the rest of the measurement.
    failures[name] = error instanceof Error ? error.message : String(error);
    results[name] = [];
  }
}

await sql.end({ timeout: 5 });

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "measurement.json"),
  JSON.stringify({ measuredAt: new Date().toISOString(), failures, results }, null, 1)
);
for (const [name, rows] of Object.entries(results)) {
  if (rows.length) writeFileSync(join(OUT, `${name}.tsv`), toTsv(rows));
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const line = (label, value) => console.log(`  ${label.padEnd(34)} ${value}`);

console.log("\n=== Indegenius: Supabase measurement ===\n");
line("PostgreSQL", results.version[0]?.version?.split(" ").slice(0, 2).join(" ") ?? "?");
line("Database size", results.database_size[0]?.pretty ?? "?");

console.log("\n-- schema sizes --");
for (const row of results.schema_sizes) {
  line(`${row.schema} (${row.tables} tables)`, row.pretty);
}

console.log("\n-- 20 largest tables in public/private --");
console.log(
  "  " +
    "table".padEnd(38) +
    "rows".padStart(10) +
    "total".padStart(12) +
    "indexes".padStart(12)
);
for (const row of results.table_sizes.slice(0, 20)) {
  console.log(
    "  " +
      `${row.schema}.${row.table}`.padEnd(38) +
      String(row.live_rows ?? row.estimated_rows ?? "?").padStart(10) +
      bytes(row.total_bytes).padStart(12) +
      bytes(row.index_bytes).padStart(12)
  );
}

const applicationBytes = results.table_sizes.reduce(
  (total, row) => total + Number(row.total_bytes ?? 0),
  0
);
const applicationRows = results.table_sizes.reduce(
  (total, row) => total + Number(row.live_rows ?? 0),
  0
);

console.log("\n-- totals --");
line("public + private, all tables", `${bytes(applicationBytes)} across ${results.table_sizes.length} tables`);
line("live rows (all application tables)", applicationRows.toLocaleString());
line("policies", results.policies.length);
line("functions", `${results.functions.length} (${results.functions.filter((f) => f.security_definer).length} SECURITY DEFINER, ${results.functions.filter((f) => f.touches_auth).length} touch auth.*)`);
line("triggers", results.triggers.length);
line("views", results.views.length);
line("tables with RLS on", `${results.rls_status.filter((r) => r.rls_enabled).length} of ${results.rls_status.length}`);
line("extensions", results.extensions.map((e) => `${e.name}@${e.version}`).join(", "));
line("auth.users", results.auth_users_count[0]?.count ?? "(not readable by this role)");

console.log("\n-- foreign keys leaving public/private --");
if (results.external_foreign_keys.length === 0) {
  console.log("  none");
} else {
  for (const row of results.external_foreign_keys) {
    console.log(`  ${row.from_table} -> ${row.to_table} (${row.constraint})`);
  }
}

if (results.storage_objects.length) {
  console.log("\n-- storage buckets (for the R2 phase, not this one) --");
  for (const row of results.storage_objects) {
    line(row.bucket_id, `${row.objects} objects, ${bytes(row.bytes)}`);
  }
}

console.log("\n-- migration strategy --");
// The threshold is about the maintenance window a restore needs, not about
// what Neon can hold. Under a few GB a dump and restore is minutes.
if (applicationBytes < 5 * 1024 ** 3) {
  console.log(
    `  ${bytes(applicationBytes)} of application data: pg_dump/pg_restore with a short\n` +
      "  maintenance window is sufficient. Logical replication is not needed."
  );
} else {
  console.log(
    `  ${bytes(applicationBytes)} of application data: large enough that a restore window\n` +
      "  may be unacceptable. Evaluate logical replication (wal_level=logical\n" +
      "  plus a publication on the Supabase side)."
  );
}

if (Object.keys(failures).length) {
  console.log("\n-- queries this role could not run --");
  for (const [name, message] of Object.entries(failures)) {
    console.log(`  ${name}: ${message}`);
  }
}

console.log(`\nWrote ${OUT}\n`);
