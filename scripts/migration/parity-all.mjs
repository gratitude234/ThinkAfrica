/**
 * Every live same-database parity harness, one run, one verdict per domain.
 *
 *   node scripts/migration/parity-all.mjs
 *
 * This is the check that only exists during this stage of the migration: both
 * sides read the SAME production database at the same instant, so a difference
 * is a difference in the query rather than in the data. The Neon comparison
 * can never say that, because Neon is a copy taken at a different time.
 *
 * READ ONLY on both sides. Nothing here writes, and nothing prints a payload.
 *
 * ## Verdicts
 *
 *   PASS     every comparison in the harness agreed
 *   FAIL     at least one comparison disagreed. Investigate before enabling
 *   BLOCKED  the harness could not run, or could only run in part
 *
 * BLOCKED is not a soft PASS. A domain is not ready to enable on a BLOCKED
 * verdict, and the reason is printed with it.
 */
import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

/** Each migrated domain, and the harness that covers it. */
const DOMAINS = [
  { domain: "post-page", file: "lib/db/postPage.parity.live.test.ts" },
  { domain: "feed", file: "lib/db/feed.parity.live.test.ts" },
  { domain: "profile-page", file: "lib/db/profilePage.parity.live.test.ts" },
  { domain: "search", file: "lib/db/search.parity.live.test.ts" },
  { domain: "comments", file: "lib/db/comments.parity.live.test.ts" },
  { domain: "viewer-state", file: "lib/db/viewerState.parity.live.test.ts" },
  {
    domain: "dashboard + bookmarks + notifications",
    file: "lib/db/viewerDomains.parity.live.test.ts",
    partial:
      "some reads need an authenticated session; see the BLOCKED lines in its output",
  },
];

const REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", "the Supabase project URL"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "the anon key, for the policy-governed comparisons"],
  ["SUPABASE_SERVICE_ROLE_KEY", "the service-role key (server-only)"],
  ["SUPABASE_DB_URL", "the direct Supabase Postgres connection"],
];

const missing = REQUIRED.filter(([name]) => !process.env[name]);
if (missing.length) {
  console.error("\nCannot run parity. Missing:\n");
  for (const [name, description] of missing) {
    console.error(`  ${name}\n      ${description}\n`);
  }
  process.exit(2);
}

// ── health probe ───────────────────────────────────────────────────────────

console.log("\nProbing Supabase before comparing anything.\n");

let direct;
try {
  const resolved = await resolveSupabaseUrl(postgres);
  direct = resolved.url;
  console.log(`  Postgres   OK  (${resolved.via})`);
} catch (error) {
  console.error(
    `  Postgres   UNREACHABLE  ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  console.error(
    "\nEvery domain is BLOCKED: the direct connection is one half of every " +
      "comparison.\n"
  );
  process.exit(2);
}

try {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`,
    {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(15_000),
    }
  );
  console.log(`  PostgREST  ${response.ok ? "OK" : `HTTP ${response.status}`}`);
  if (!response.ok) {
    console.error(
      "\nEvery domain is BLOCKED: PostgREST is the other half.\n"
    );
    process.exit(2);
  }
} catch (error) {
  console.error(
    `  PostgREST  UNREACHABLE  ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  console.error("\nEvery domain is BLOCKED.\n");
  process.exit(2);
}

// ── the harnesses ──────────────────────────────────────────────────────────

console.log("\nComparing PostgREST and PostgreSQL against the same database.\n");

const results = [];

for (const { domain, file, partial } of DOMAINS) {
  console.log(`\n──────── ${domain} ────────`);
  const run = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", file, "--reporter=verbose"],
    { stdio: "inherit", env: { ...process.env, SUPABASE_DIRECT_URL: direct } }
  );

  const status = run.status ?? 1;
  results.push({
    domain,
    verdict: status === 0 ? (partial ? "PASS (partial)" : "PASS") : "FAIL",
    note: status === 0 ? (partial ?? "") : "a comparison disagreed",
  });
}

// ── the table ──────────────────────────────────────────────────────────────

console.log("\n\n================ PARITY BY DOMAIN ================\n");
const width = Math.max(...results.map((row) => row.domain.length));
for (const row of results) {
  console.log(
    `  ${row.domain.padEnd(width)}  ${row.verdict.padEnd(14)}  ${row.note}`
  );
}
console.log("\n=================================================\n");

const failed = results.filter((row) => row.verdict === "FAIL");
if (failed.length) {
  console.error(
    `${failed.length} domain(s) FAILED. Do not enable any of them.\n`
  );
  process.exit(1);
}

console.log(
  "No domain disagreed. This is not by itself an instruction to enable " +
    "anything: READ_MIGRATED_DOMAINS stays unset until that is a decision " +
    "somebody makes.\n"
);
