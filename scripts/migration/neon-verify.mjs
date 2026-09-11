/**
 * Every repository behavioural suite, run against Neon itself.
 *
 *   node scripts/migration/neon-verify.mjs
 *
 * ## Why this exists as its own command
 *
 * The parity harnesses compare the repositories against *Supabase* Postgres.
 * That is the right comparison while Supabase is the database of record, and
 * it says nothing about the database that will actually serve reads after
 * cutover. Neon has its own planner, its own collation, its own extension set
 * and its own idea of what a cold query costs. A repository that is correct
 * against one PostgreSQL is very probably correct against another, and
 * "very probably" is not the standard for moving production.
 *
 * ## Why --no-file-parallelism, and why it is not a workaround
 *
 * These suites share one real database. Vitest runs test files in parallel by
 * default, so the mutation suite's inserts land while the read suites are
 * counting rows, and `publishes an ordinary draft` fails in a way that looks
 * like a Neon defect and is not: it passes alone and failed only alongside
 * twelve readers. Serialising them is the correct configuration for suites
 * that share state, not a concession to make a red run green.
 *
 * Everything here is read-only apart from transactions that are rolled back.
 */
import { spawnSync } from "node:child_process";

import { loadEnv } from "./env.mjs";

loadEnv();

const url = process.env.DATABASE_URL ?? "";
if (!url.includes(".neon.tech")) {
  console.error(
    "\nDATABASE_URL does not point at Neon, so these suites would skip and\n" +
      "report success. Point it at Neon and run again.\n"
  );
  process.exit(2);
}

/** One suite per migrated domain, plus the write-policy layer. */
const SUITES = [
  "lib/db/search.neon.test.ts",
  "lib/db/postPage.neon.test.ts",
  "lib/db/feed.neon.test.ts",
  "lib/db/feedList.neon.test.ts",
  "lib/db/profilePage.neon.test.ts",
  "lib/db/profileRecord.neon.test.ts",
  "lib/db/profileVisibility.neon.test.ts",
  "lib/db/comments.neon.test.ts",
  "lib/db/viewerState.neon.test.ts",
  "lib/db/dashboard.neon.test.ts",
  "lib/db/bookmarks.neon.test.ts",
  "lib/db/notifications.neon.test.ts",
  "lib/postPolicy.neon.test.ts",
  "lib/postMutations.neon.test.ts",
];

console.log(`\nVerifying ${SUITES.length} suite(s) against Neon, serially.\n`);

const run = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--no-file-parallelism",
    ...SUITES,
  ],
  { stdio: "inherit", env: process.env }
);

const status = run.status ?? 1;
console.log(
  status === 0
    ? "\nNeon answers every behavioural suite. This is BEHAVIOURAL PROOF against\n" +
        "the target database, and is separate from live same-database parity.\n"
    : "\nNeon did not pass. Do not point production reads at it.\n"
);
process.exit(status);
