/**
 * Run a command with `.env.local` loaded, the way the parity runners do.
 *
 *   node scripts/migration/run-with-env.mjs npx vitest run lib/db/feedList.neon.test.ts
 *
 * The Neon behavioural suites gate on `DATABASE_URL` containing `.neon.tech`,
 * and a suite that silently skips is indistinguishable in a summary line from
 * one that ran and passed. This exists so "58 skipped" cannot be mistaken for
 * evidence.
 */
import { spawnSync } from "node:child_process";

import { loadEnv } from "./env.mjs";

loadEnv();

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("\nPass a command to run.\n");
  process.exit(2);
}

const run = spawnSync(command, args, {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

process.exit(run.status ?? 1);
