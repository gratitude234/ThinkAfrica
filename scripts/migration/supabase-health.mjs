/**
 * Is Supabase back?
 *
 *   node scripts/migration/supabase-health.mjs
 *
 * Two independent halves, because they fail independently and have been
 * failing independently: PostgREST answers over HTTPS, and Postgres answers
 * through Supavisor. Every parity comparison needs both, so either being down
 * means every domain is BLOCKED.
 *
 * Exit 0 when both are reachable. Exit 2 when either is not, so this can gate
 * a script without anyone reading the output.
 *
 * READ ONLY. It asks PostgREST for its root document and Postgres for
 * `select 1`, and prints no data from either.
 */
import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "\nNEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.\n"
  );
  process.exit(2);
}

let restOk = false;
let postgresOk = false;

// ── PostgREST ──────────────────────────────────────────────────────────────

const startedRest = Date.now();
try {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const elapsed = Date.now() - startedRest;

  // Any answer below 500 means PostgREST is up and talking, which is what a
  // health probe is asking. A 401 is a decision about a request; a 502 or a
  // timeout is the gateway being unable to make one, which is what the outage
  // actually looked like.
  restOk = response.status < 500;
  const verdict = response.ok
    ? "OK"
    : restOk
      ? `ANSWERING (HTTP ${response.status})`
      : `DOWN (HTTP ${response.status})`;
  console.log(`PostgREST   ${verdict}   ${elapsed}ms`);
} catch (error) {
  console.log(
    `PostgREST   UNREACHABLE   ${Date.now() - startedRest}ms   ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

// ── Postgres, through whichever route resolves ─────────────────────────────

const startedPg = Date.now();
try {
  const resolved = await resolveSupabaseUrl(postgres);
  const sql = postgres(resolved.url, {
    max: 1,
    prepare: false,
    connect_timeout: 20,
    fetch_types: false,
    onnotice: () => {},
  });
  await sql`select 1`;
  await sql.end({ timeout: 5 });
  postgresOk = true;
  console.log(`Postgres    OK   ${Date.now() - startedPg}ms   via ${resolved.via}`);
} catch (error) {
  console.log(
    `Postgres    UNREACHABLE   ${Date.now() - startedPg}ms   ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

// ── verdict ────────────────────────────────────────────────────────────────

console.log("");
if (restOk && postgresOk) {
  console.log("Both halves are up. The recovery sequence can start:");
  console.log("  docs/supabase-recovery-runbook.md\n");
  process.exit(0);
}

console.log("Not ready. Still down:");
if (!restOk) console.log("  PostgREST");
if (!postgresOk) console.log("  Postgres (Supavisor)");
console.log(
  "\nEvery parity comparison needs both halves, so every domain is BLOCKED " +
    "until they answer.\n"
);
process.exit(2);
