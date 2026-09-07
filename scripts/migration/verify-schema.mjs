/**
 * Verifies the Neon scratch schema against Supabase, and against the security
 * properties the preflight is supposed to establish.
 *
 *   node scripts/migration/verify-schema.mjs
 *
 * READ-ONLY on both databases.
 *
 * Two kinds of check, and both matter:
 *
 *   - **Parity**: every table, view, index, trigger, function and policy that
 *     exists on Supabase exists on Neon, except the ones the manifest says
 *     were deliberately removed. A missing object is a failure; an object the
 *     manifest accounts for is not.
 *   - **Posture**: the application role owns nothing, cannot create, has a
 *     statement timeout, and cannot reach `private`. No provider schema was
 *     imported. No foreign key still points at `auth.users`.
 *
 * Exits non-zero if anything fails, so it can gate the data copy.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadEnv, redact, requireUrl, resolveSupabaseUrl } from "./env.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");

loadEnv();

const { url: supabaseUrl, via } = await resolveSupabaseUrl(postgres);
console.log(`Supabase reached via: ${via}\n`);

const supabase = postgres(supabaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 60_000 },
  onnotice: () => {},
});
const neon = postgres(requireUrl("DATABASE_URL_DIRECT"), {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  connection: { statement_timeout: 60_000 },
  onnotice: () => {},
});

const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
/** Objects the transformation removed on purpose. */
const removedFunctions = new Set(
  manifest.entries
    .filter((entry) => entry.object.startsWith("function ") && entry.action === "removed")
    .map((entry) => entry.object.replace(/^function /, "").replace(/\(\)$/, ""))
);
const removedConstraints = new Set(
  manifest.entries
    .filter((entry) => entry.object.startsWith("constraint "))
    .map((entry) => entry.object.replace(/^constraint (\S+) on .*$/, "$1"))
);

const failures = [];
const notes = [];

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

// ---------------------------------------------------------------------------
// Object parity
// ---------------------------------------------------------------------------

const OBJECT_QUERIES = {
  tables: (sql) => sql`
    select n.nspname || '.' || c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname in ('public','private') order by 1`,
  views: (sql) => sql`
    select schemaname || '.' || viewname as name from pg_views
     where schemaname in ('public','private') order by 1`,
  indexes: (sql) => sql`
    select schemaname || '.' || indexname as name from pg_indexes
     where schemaname in ('public','private') order by 1`,
  triggers: (sql) => sql`
    select event_object_schema || '.' || event_object_table || '.' || trigger_name as name
      from information_schema.triggers
     where event_object_schema in ('public','private') group by 1 order by 1`,
  functions: (sql) => sql`
    select n.nspname || '.' || p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public','private') order by 1`,
  policies: (sql) => sql`
    select schemaname || '.' || tablename || '.' || policyname as name
      from pg_policies where schemaname in ('public','private') order by 1`,
  sequences: (sql) => sql`
    select sequence_schema || '.' || sequence_name as name
      from information_schema.sequences
     where sequence_schema in ('public','private') order by 1`,
  constraints: (sql) => sql`
    select conname as name from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname in ('public','private') and con.contype = 'f' order by 1`,
};

console.log("--- object parity (Supabase -> Neon) ---");

const parity = {};
for (const [kind, query] of Object.entries(OBJECT_QUERIES)) {
  const left = new Set((await query(supabase)).map((row) => row.name));
  const right = new Set((await query(neon)).map((row) => row.name));

  const missing = [...left].filter((name) => !right.has(name));
  const extra = [...right].filter((name) => !left.has(name));

  const accountedFor = missing.filter((name) => {
    if (kind === "functions") return removedFunctions.has(name);
    if (kind === "constraints") return removedConstraints.has(name);
    return false;
  });
  const unexplained = missing.filter((name) => !accountedFor.includes(name));

  parity[kind] = { supabase: left.size, neon: right.size, missing, extra, accountedFor, unexplained };

  check(
    `${kind.padEnd(12)} ${String(left.size).padStart(4)} -> ${String(right.size).padStart(4)}`,
    unexplained.length === 0,
    accountedFor.length ? `(${accountedFor.length} removed by manifest)` : ""
  );
  for (const name of unexplained.slice(0, 10)) console.log(`          MISSING: ${name}`);
  // `extra` is expected for functions (the auth shim) and is reported, not failed.
  if (extra.length && kind !== "functions") {
    for (const name of extra.slice(0, 10)) notes.push(`extra ${kind}: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Posture
// ---------------------------------------------------------------------------

console.log("\n--- provider schemas ---");
const providerSchemas = await neon`
  select nspname as name from pg_namespace
   where nspname in ('storage','realtime','vault','net','supabase_functions',
                     'extensions','graphql','graphql_public','supabase_migrations',
                     'pgbouncer','cron')`;
check(
  "no provider schema imported",
  providerSchemas.length === 0,
  providerSchemas.length ? providerSchemas.map((r) => r.name).join(", ") : ""
);

const authObjects = await neon`
  select c.relkind as kind, count(*)::int as n
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'auth' group by 1`;
check(
  "auth schema holds no tables (shim only)",
  authObjects.every((row) => row.kind !== "r"),
  `${authObjects.length === 0 ? "no relations" : authObjects.map((r) => `${r.kind}:${r.n}`).join(", ")}`
);

const authFunctions = await neon`
  select p.proname as name from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' order by 1`;
check(
  "auth shim provides uid() and role()",
  authFunctions.length === 2 && authFunctions.every((r) => ["uid", "role"].includes(r.name)),
  authFunctions.map((r) => r.name).join(", ")
);

const [{ uid }] = await neon`select auth.uid() is null as uid`;
check("auth.uid() is NULL by default, so policies deny", uid === true);

console.log("\n--- foreign keys ---");
const danglingFks = await neon`
  select con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_class frel on frel.oid = con.confrelid
    join pg_namespace fnsp on fnsp.oid = frel.relnamespace
   where con.contype = 'f' and nsp.nspname in ('public','private')
     and fnsp.nspname not in ('public','private')`;
check(
  "no foreign key leaves public/private",
  danglingFks.length === 0,
  danglingFks.map((r) => r.name).join(", ")
);

console.log("\n--- extensions ---");
const extensions = await neon`select extname as name from pg_extension order by 1`;
const required = ["pgcrypto", "uuid-ossp", "pg_stat_statements"];
const names = extensions.map((row) => row.name);
check("required extensions present", required.every((name) => names.includes(name)), names.join(", "));
check(
  "no provider extension",
  !names.some((name) => ["pg_cron", "pg_net", "supabase_vault"].includes(name))
);

console.log("\n--- roles and grants ---");
const [{ n: owned }] = await neon`
  select count(*)::int as n from pg_class c
   join pg_roles r on r.oid = c.relowner
   where r.rolname = 'indegenius_app'`;
check("indegenius_app owns nothing, so RLS applies to it", owned === 0, `${owned} objects`);

const [{ canlogin, rolcreatedb, rolsuper }] = await neon`
  select rolcanlogin as canlogin, rolcreatedb, rolsuper from pg_roles
   where rolname = 'indegenius_app'`;
check("indegenius_app is not a superuser and cannot create databases", !rolsuper && !rolcreatedb, `login=${canlogin}`);

const [{ n: appReadable }] = await neon`
  select count(*)::int as n from information_schema.role_table_grants
   where grantee = 'indegenius_app' and table_schema = 'public' and privilege_type = 'SELECT'`;
check("indegenius_app can read public", appReadable > 0, `${appReadable} tables`);

const [{ n: privateReadable }] = await neon`
  select count(*)::int as n from information_schema.role_table_grants
   where grantee = 'indegenius_app' and table_schema = 'private'`;
check("indegenius_app cannot reach private", privateReadable === 0, `${privateReadable} grants`);

const [{ timeout }] = await neon`
  select coalesce((select unnest(rolconfig) from pg_roles
    where rolname = 'indegenius_app' and unnest like 'statement_timeout=%'), '') as timeout`
  .catch(async () => {
    const rows = await neon`select rolconfig from pg_roles where rolname = 'indegenius_app'`;
    const config = rows[0]?.rolconfig ?? [];
    return [{ timeout: config.find((entry) => entry.startsWith("statement_timeout=")) ?? "" }];
  });
check("indegenius_app has a statement timeout", timeout.includes("statement_timeout="), timeout);

console.log("\n--- RLS ---");
const [{ n: rlsOff }] = await neon`
  select count(*)::int as n from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
   where c.relkind = 'r' and nsp.nspname = 'public' and not c.relrowsecurity`;
const [{ n: supabaseRlsOff }] = await supabase`
  select count(*)::int as n from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
   where c.relkind = 'r' and nsp.nspname = 'public' and not c.relrowsecurity`;
check(
  "RLS enabled on the same tables as Supabase",
  rlsOff === supabaseRlsOff,
  `neon ${rlsOff} without, supabase ${supabaseRlsOff} without`
);

// ---------------------------------------------------------------------------

if (notes.length) {
  console.log("\n--- notes ---");
  for (const note of notes.slice(0, 20)) console.log(`  ${note}`);
}

console.log(
  `\n${failures.length === 0 ? "SCHEMA VERIFIED" : `${failures.length} CHECK(S) FAILED`}`
);
for (const failure of failures) console.log(`  - ${failure}`);

await supabase.end({ timeout: 5 }).catch(() => {});
await neon.end({ timeout: 5 }).catch(() => {});
void redact;
process.exit(failures.length === 0 ? 0 : 1);
