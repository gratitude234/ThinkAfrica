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
  // A real query, not the root document. The root answers 401 to a request
  // carrying only an apikey, which says nothing about whether PostgREST can
  // serve data: it is a decision about that request. What the harnesses need
  // is a table read, so that is what is probed.
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/posts?select=id&limit=1`,
    {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
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

/**
 * A socket that dropped is not a disagreement.
 *
 * This loop used to report every non-zero exit as "a comparison disagreed".
 * PostgREST drops connections under sustained load from these harnesses, so
 * whole domains were recorded as parity failures when nothing had disagreed,
 * and the table was then read as evidence about the database. Only a run whose
 * output carries a transport error and no assertion failure is retried, and a
 * run that still cannot reach PostgREST is reported as BLOCKED rather than
 * counted as either a pass or a failure.
 */
function classify(output) {
  const transport =
    /TypeError: fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/.test(
      output
    );
  const disagreement = /AssertionError/.test(output);
  return { transport, disagreement };
}

const ATTEMPTS = Number(process.env.PARITY_ATTEMPTS ?? 3);

for (const { domain, file, partial } of DOMAINS) {
  console.log(`\n──────── ${domain} ────────`);

  let status = 1;
  let output = "";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const run = spawnSync(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", file, "--reporter=verbose"],
      {
        encoding: "utf8",
        env: { ...process.env, SUPABASE_DIRECT_URL: direct },
        maxBuffer: 64 * 1024 * 1024,
      }
    );

    output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    status = run.status ?? 1;
    process.stdout.write(output);

    if (status === 0) break;

    const { transport, disagreement } = classify(output);
    if (!transport || disagreement || attempt === ATTEMPTS) break;

    const pause = 5000 * 2 ** (attempt - 1);
    console.log(
      `  attempt ${attempt}: transport failure, no disagreement. ` +
        `Retrying in ${pause / 1000}s.`
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
  }

  if (status === 0) {
    results.push({
      domain,
      verdict: partial ? "PASS (partial)" : "PASS",
      note: partial ?? "",
    });
    continue;
  }

  const { transport, disagreement } = classify(output);
  results.push(
    transport && !disagreement
      ? {
          domain,
          verdict: "BLOCKED",
          note: `could not reach PostgREST after ${ATTEMPTS} attempts; nothing disagreed`,
        }
      : { domain, verdict: "FAIL", note: "a comparison disagreed" }
  );
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
const blocked = results.filter((row) => row.verdict === "BLOCKED");

if (failed.length) {
  console.error(
    `${failed.length} domain(s) FAILED. Do not enable any of them.\n`
  );
  process.exit(1);
}

if (blocked.length) {
  // Blocked is not green. The comparison did not happen, so the domain has no
  // parity evidence and must not be enabled on the strength of this run.
  console.error(
    `${blocked.length} domain(s) BLOCKED: PostgREST could not be reached. ` +
      "Nothing disagreed, and nothing was proved either. Re-run those " +
      "domains before treating them as covered.\n"
  );
  process.exit(2);
}

console.log(
  "No domain disagreed. This is not by itself an instruction to enable " +
    "anything: READ_MIGRATED_DOMAINS stays unset until that is a decision " +
    "somebody makes.\n"
);
