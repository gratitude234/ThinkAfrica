/**
 * Compares the public profile's PostgREST reads with its PostgreSQL reads,
 * against the SAME production database.
 *
 *   node scripts/migration/profile-parity.mjs
 *
 * This is LIVE SAME-DATABASE PARITY, and it is a different claim from the
 * behavioural proofs in lib/db/profilePage.neon.test.ts and
 * lib/db/profileRecord.neon.test.ts. Both sides here see identical rows at the
 * same instant, so a difference is a difference in the query rather than in
 * the data. The Neon comparison can never say that, because Neon is a copy
 * taken at a different time.
 *
 * READ ONLY on both sides. It resolves the direct connection the same way
 * every other script here does, so it reaches Supabase over IPv4 via Supavisor.
 */
import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", "the Supabase project URL"],
  ["SUPABASE_SERVICE_ROLE_KEY", "the service-role key (server-only)"],
  ["SUPABASE_DB_URL", "the direct Supabase Postgres connection"],
];

const missing = REQUIRED.filter(([name]) => !process.env[name]);
if (missing.length) {
  console.error("\nCannot run the profile parity check. Missing:\n");
  for (const [name, description] of missing) {
    console.error(`  ${name}\n      ${description}\n`);
  }
  process.exit(2);
}

let direct;
try {
  const resolved = await resolveSupabaseUrl(postgres);
  direct = resolved.url;
  console.log(`\nDirect Postgres via ${resolved.via}.`);
} catch (error) {
  console.error(
    `\nCould not reach Supabase Postgres: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exit(2);
}

console.log("Comparing PostgREST and PostgreSQL against the same database.\n");

const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "lib/db/profilePage.parity.live.test.ts",
    "--reporter=verbose",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, SUPABASE_DIRECT_URL: direct },
  }
);

process.exit(result.status ?? 1);
