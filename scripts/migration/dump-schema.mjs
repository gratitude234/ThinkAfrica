/**
 * Takes a raw schema dump of the application-owned schemas from Supabase.
 *
 * READ-ONLY. `pg_dump --schema-only` opens a repeatable-read transaction and
 * reads the catalogue; it writes nothing and locks nothing that matters.
 *
 *   node scripts/migration/dump-schema.mjs
 *
 * The output is `out/schema.raw.sql`, and it is an INPUT, not something to
 * apply. It still contains references to `auth.users`, grants to PostgREST
 * roles, and `pg_cron`/`pg_net`/`vault` objects, none of which exist on Neon.
 * `transform-schema.mjs` turns it into something applicable, deterministically
 * and with a manifest.
 *
 * Two flags carry the whole intent:
 *
 *   --schema=public --schema=private  the allowlist. Everything Supabase owns
 *                                     is excluded by not being named.
 *   --no-owner --no-privileges        strips OWNER TO and GRANT statements
 *                                     naming Supabase's roles. Neon has no
 *                                     `anon`, `authenticated` or
 *                                     `service_role`, and a restore that
 *                                     tried to grant to them would fail.
 *                                     The replacement grants are the
 *                                     preflight's, which name one application
 *                                     role.
 */
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertDumperNewerThan, loadEnv, redact, resolveSupabaseUrl } from "./env.mjs";
import { pgDump } from "./pg.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "out");
const RAW = join(OUT, "schema.raw.sql");

loadEnv();

const { url, via } = await resolveSupabaseUrl(postgres);
console.log(`Supabase reached via: ${via}`);

// Ask the server its version before choosing a dumper, rather than after
// discovering the dump is incomplete.
const probe = postgres(url, {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  onnotice: () => {},
});
let serverMajor;
try {
  const [{ num }] = await probe`select current_setting('server_version_num') as num`;
  serverMajor = Math.floor(Number(num) / 10000);
} finally {
  await probe.end({ timeout: 5 }).catch(() => {});
}

let tools;
try {
  tools = assertDumperNewerThan(serverMajor);
} catch (error) {
  console.error(redact(error));
  process.exit(2);
}

console.log(`server: PostgreSQL ${serverMajor}`);
console.log(`dumper: ${tools.version} (${tools.source})`);

mkdirSync(OUT, { recursive: true });

const result = pgDump(url, [
  "--schema-only",
  "--schema=public",
  "--schema=private",
  "--no-owner",
  "--no-privileges",
  "--no-publications",
  "--no-subscriptions",
  // Comments are kept: several of them are the only record of why a guard
  // function exists, and losing them would lose the reasoning with them.
  "--no-security-labels",
  // A stable statement order makes the transform's output diffable between
  // runs, which is the difference between a pipeline and a one-off.
  "--no-tablespaces",
]);

if (result.status !== 0) {
  console.error(`pg_dump exited ${result.status}`);
  console.error(redact({ message: result.stderr }));
  process.exit(result.status);
}

if (result.stderr.trim()) {
  console.log("\npg_dump notices:");
  for (const line of result.stderr.trim().split(/\r?\n/)) {
    console.log(`  ${redact({ message: line })}`);
  }
}

writeFileSync(RAW, result.stdout, "utf8");

const lines = result.stdout.split(/\r?\n/).length;
const size = statSync(RAW).size;
console.log(`\nwrote out/schema.raw.sql: ${lines} lines, ${(size / 1024).toFixed(0)} kB`);
console.log("\nThis is the raw dump. Run transform-schema.mjs before applying it.");
