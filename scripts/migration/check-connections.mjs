/**
 * Read-only connectivity check for all three databases.
 *
 * Runs `select current_database()` and `select version()` and nothing else. It
 * prints the PostgreSQL version, the database name and a host *class*; it never
 * prints a host, a user, a password or a connection string, and it redacts the
 * driver's own error text, which routinely embeds all four.
 *
 * It also refuses to be quiet about a surprise: if the Neon scratch database
 * already holds application tables, that is reported prominently, because
 * everything downstream assumes an empty target.
 *
 *   node scripts/migration/check-connections.mjs
 */
import postgres from "postgres";
import { describe, loadEnv, redact, requireUrl, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const TARGETS = [
  { label: "Supabase (production, read-only)", key: "SUPABASE_DB_URL", supabase: true },
  { label: "Neon scratch, pooled", key: "DATABASE_URL" },
  { label: "Neon scratch, direct", key: "DATABASE_URL_DIRECT" },
];

const results = [];

for (const target of TARGETS) {
  let url;
  let via = null;
  try {
    if (target.supabase) {
      // The direct host is IPv6-only. On a network without IPv6 this falls
      // back to Supavisor session mode. See env.mjs.
      const resolved = await resolveSupabaseUrl(postgres);
      url = resolved.url;
      via = resolved.via;
    } else {
      url = requireUrl(target.key);
    }
  } catch (error) {
    console.log(`\n${target.label}`);
    console.log(`  ${target.key}: missing`);
    console.log(error instanceof Error ? error.message : String(error));
    results.push({ ...target, ok: false });
    continue;
  }

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 20,
    idle_timeout: 5,
    connection: { statement_timeout: 30_000 },
    onnotice: () => {},
  });

  console.log(`\n${target.label}`);
  console.log(`  endpoint: ${describe(url)}`);
  if (via) console.log(`  reached:  ${via}`);

  try {
    const [{ current_database: database }] = await sql`select current_database()`;
    const [{ version }] = await sql`select version()`;
    const [{ num }] = await sql`select current_setting('server_version_num') as num`;
    const [{ user_name: role }] = await sql`select current_user as user_name`;

    // The version banner carries the platform and the compiler; the first two
    // words are the part anyone needs.
    const short = version.split(",")[0].trim();

    console.log("  connection: OK");
    console.log(`  database:   ${database}`);
    console.log(`  version:    ${short} (server_version_num ${num})`);
    console.log(`  role:       ${role}`);

    // Only meaningful for the Neon targets, but harmless everywhere.
    const [{ count: appTables }] = await sql`
      select count(*)::int as count
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where c.relkind = 'r' and n.nspname in ('public', 'private')`;
    console.log(`  tables in public+private: ${appTables}`);

    results.push({
      ...target,
      ok: true,
      database,
      version: short,
      versionNum: Number(num),
      role,
      appTables,
    });
  } catch (error) {
    console.log("  connection: FAILED");
    console.log(`  reason: ${redact(error)}`);
    results.push({ ...target, ok: false });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

console.log("\n--- summary ---");
for (const result of results) {
  console.log(`  ${result.label.padEnd(36)} ${result.ok ? "OK" : "FAILED"}`);
}

const neon = results.filter((result) => result.key !== "SUPABASE_DB_URL" && result.ok);
const occupied = neon.filter((result) => (result.appTables ?? 0) > 0);

if (occupied.length > 0) {
  console.log(
    "\nSTOP: the Neon scratch database already contains application tables\n" +
      `       (${occupied[0].appTables} in public+private). Everything downstream\n` +
      "       assumes an empty target. Inspect before modifying anything:\n" +
      "         node scripts/migration/check-connections.mjs --list\n"
  );
}

if (process.argv.includes("--list") && occupied.length > 0) {
  const sql = postgres(requireUrl("DATABASE_URL_DIRECT"), {
    max: 1,
    prepare: false,
    connect_timeout: 20,
    onnotice: () => {},
  });
  try {
    const rows = await sql`
      select n.nspname as schema, c.relname as name, c.relkind as kind
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'private')
         and c.relkind in ('r', 'v', 'm', 'S')
       order by 1, 3, 2`;
    console.log("\nexisting objects in the Neon scratch database:");
    for (const row of rows) {
      console.log(`  ${row.schema}.${row.name} (${row.kind})`);
    }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

process.exit(results.every((result) => result.ok) ? 0 : 1);
