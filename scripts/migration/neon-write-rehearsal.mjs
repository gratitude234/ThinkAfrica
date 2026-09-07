/**
 * Runs the real post mutation domain against Neon and checks what happened.
 *
 *   node scripts/migration/neon-write-rehearsal.mjs
 *
 * The Neon write-safety test (lib/postPolicy.neon.test.ts) proves the *policy*
 * refuses what the database permits. This proves the other half: that the
 * PostgreSQL write repository underneath that policy actually performs the
 * legitimate mutations, correctly, with the right rows changed and no others.
 *
 * It imports lib/postMutations.ts, not a copy of it. Every call goes through
 * the same policy, the same predicates and the same affected-row check that a
 * server action uses; only the repository underneath differs.
 *
 * Neon scratch only. Everything runs inside one transaction that is rolled
 * back at the end, on synthetic rows created inside it, so no real post is
 * touched even momentarily and the database is unchanged afterwards.
 */
import { spawnSync } from "node:child_process";

import { loadEnv } from "./env.mjs";

loadEnv();

const neonUrl = process.env.DATABASE_URL;

if (!neonUrl) {
  console.error("\nMissing DATABASE_URL (the Neon scratch connection string).\n");
  process.exit(2);
}
if (!new URL(neonUrl).hostname.endsWith(".neon.tech")) {
  console.error("\nREFUSED: DATABASE_URL does not point at Neon.\n");
  process.exit(2);
}

console.log(
  "\nRunning the post mutation domain against Neon.\n" +
    "One transaction, synthetic rows, rolled back at the end.\n"
);

const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "lib/postMutations.neon.test.ts",
    "--reporter=verbose",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, WRITE_DATABASE_ADAPTER: "postgres" },
  }
);

process.exit(result.status ?? 1);
