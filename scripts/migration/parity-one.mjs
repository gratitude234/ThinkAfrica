/**
 * One parity harness, with the environment loaded and transient failures
 * retried.
 *
 *   node scripts/migration/parity-one.mjs lib/db/postPage.parity.live.test.ts
 *
 * ## Why retries, and why they are not cheating
 *
 * A PostgREST request can fail at the socket -- `TypeError: fetch failed` --
 * and that is a statement about the network, not about whether two queries
 * agree. Treating it as a parity failure would be wrong in one direction;
 * retrying a genuine disagreement would be wrong in the other, and much worse.
 *
 * So only a run whose output contains a transport error and NO assertion
 * failure is retried. A run that reports a disagreement is final, and is
 * reported the first time it is seen.
 */
import { spawnSync } from "node:child_process";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const file = process.argv[2];
if (!file) {
  console.error("\nPass a harness path.\n");
  process.exit(2);
}

const attempts = Number(process.env.PARITY_ATTEMPTS ?? 3);

const resolved = await resolveSupabaseUrl(postgres);
const env = { ...process.env, SUPABASE_DIRECT_URL: resolved.url };

/** A transport failure, as opposed to a comparison that disagreed. */
function isTransient(output) {
  const transport =
    /TypeError: fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|socket hang up|EAI_AGAIN|ENOTFOUND|getaddrinfo|EPIPE/.test(
      output
    );
  const disagreement = /AssertionError/.test(output);
  return transport && !disagreement;
}

let lastOutput = "";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const run = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", file, "--reporter=verbose"],
    { encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 }
  );

  lastOutput = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const status = run.status ?? 1;

  if (status === 0) {
    console.log(lastOutput);
    console.log(`\nPASS on attempt ${attempt}.\n`);
    process.exit(0);
  }

  if (isTransient(lastOutput) && attempt < attempts) {
    // Back off before retrying. Three immediate retries all land in the same
    // saturated moment and prove nothing beyond the first, which is how a
    // recovering pooler gets reported as three failures instead of one wait.
    const pause = 5000 * 2 ** (attempt - 1);
    console.log(
      `  attempt ${attempt}: transport failure, no disagreement. ` +
        `Retrying in ${pause / 1000}s.`
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
    continue;
  }

  console.log(lastOutput);
  console.log(
    `\n${isTransient(lastOutput) ? "TRANSPORT FAILURE" : "FAIL"} after ${attempt} attempt(s).\n`
  );
  process.exit(1);
}
