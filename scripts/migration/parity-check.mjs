/**
 * Run the live adapter differential.
 *
 * The comparison itself lives in lib/db/parity.live.test.ts, because it has to
 * import the application's own modules: the SQL, the PostgREST projection and
 * the comparison rules all come from `lib/db`, so the harness cannot drift
 * from what production would run. Vitest already resolves the `@/` aliases,
 * strips the types and shims `server-only`; a standalone script would need to
 * reimplement all three, and a hand-rolled type stripper is how a harness ends
 * up testing something other than the code it claims to.
 *
 * This wrapper exists so the command is discoverable and so a missing
 * credential is a clear message rather than a silently skipped test.
 *
 * READ-ONLY on both databases.
 */
import { spawnSync } from "node:child_process";
import { loadEnv } from "./env.mjs";

// The comparison runs under Vitest, which does not read .env.local. Loading it
// here means the same command works whether the values live in the file or in
// the surrounding environment.
loadEnv();

const REQUIRED = [
  [
    "NEXT_PUBLIC_SUPABASE_URL",
    "the Supabase project URL, e.g. https://<ref>.supabase.co",
  ],
  [
    "SUPABASE_SERVICE_ROLE_KEY",
    "the Supabase service-role key (server-only; never in a browser bundle)",
  ],
  [
    "DATABASE_URL",
    "the Neon SCRATCH connection string. Use the pooled endpoint, and never point this at production",
  ],
];

const missing = REQUIRED.filter(([name]) => !process.env[name]);

if (missing.length) {
  console.error("\nCannot run the adapter parity check. Missing:\n");
  for (const [name, description] of missing) {
    console.error(`  ${name}\n      ${description}\n`);
  }
  console.error(
    "Both databases are read only, one SELECT per slug per adapter.\n" +
      "See scripts/migration/README.md for how the scratch database is created.\n"
  );
  process.exit(2);
}

console.log("\nRunning the adapter differential (read-only on both sides)...\n");

// Vitest's own entry point, run by this Node rather than through npx: the npx
// shim on Windows loses stdio when the parent's output is redirected, which
// turned a passing run into silence.
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "lib/db/parity.live.test.ts",
    "--reporter=verbose",
  ],
  { stdio: "inherit", env: process.env }
);

process.exit(result.status ?? 1);
