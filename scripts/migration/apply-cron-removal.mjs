/**
 * Applies 20260914000001_remove_review_reminders_cron_job.sql.
 *
 *   node scripts/migration/apply-cron-removal.mjs --dry-run
 *   node scripts/migration/apply-cron-removal.mjs --apply
 *
 * The same workflow as apply-identity-migrations.mjs: there is no local
 * migration runner, so the reviewed file is sent over the direct connection
 * inside one transaction with a lock timeout.
 *
 * Both modes verify the result inside that transaction before it ends:
 *
 *   - the review reminder job is no longer in cron.job;
 *   - every other Indegenius job is exactly as it was, schedule and command;
 *   - inspect_indegenius_cron_jobs() reports exactly the remaining set;
 *   - dispatch refuses the review reminder job/path pair;
 *   - no telemetry job exists.
 *
 * `--dry-run` then rolls back, which answers whether the file applies against
 * this database's current state without changing it. `--apply` commits only
 * if every check passed, and rolls back otherwise.
 *
 * Nothing printed carries a secret: jobs are listed by name and schedule.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const FILE = "20260914000001_remove_review_reminders_cron_job.sql";
const REMOVED = "indegenius-review-reminders";

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error("\nPass --dry-run or --apply.\n");
  process.exit(2);
}

/** The file, with its own transaction boundary removed so the caller owns it. */
function statements() {
  return readFileSync(resolve("supabase/migrations", FILE), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*begin;\s*$/im, "")
    .replace(/^\s*commit;\s*$/im, "");
}

const resolved = await resolveSupabaseUrl(postgres);
console.log(`\nConnected via ${resolved.via}`);
console.log(`Mode: ${mode}\n`);

const sql = postgres(resolved.url, {
  max: 1,
  prepare: false,
  connect_timeout: 20,
  fetch_types: false,
  onnotice: (notice) => console.log(`  notice: ${notice.message}`),
});

const jobsQuery = (tx) =>
  tx`select jobname, schedule, command, active from cron.job where jobname like 'indegenius-%' order by jobname`;

let outcome = "unknown";
try {
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local lock_timeout = '5s'");

      const before = await jobsQuery(tx);
      console.log(`Before: ${before.map((job) => job.jobname).join(", ")}`);

      const started = Date.now();
      await tx.unsafe(statements());
      console.log(`  ${mode === "apply" ? "applied" : "would apply"} ${FILE}  ${Date.now() - started}ms`);

      const after = await jobsQuery(tx);
      console.log(`After:  ${after.map((job) => job.jobname).join(", ")}`);

      const failures = [];
      if (after.some((job) => job.jobname === REMOVED)) failures.push("review reminder job still scheduled");
      if (after.some((job) => job.jobname === "indegenius-db-telemetry")) failures.push("telemetry job present");

      const expected = before.filter((job) => job.jobname !== REMOVED);
      if (JSON.stringify(expected) !== JSON.stringify(after)) {
        failures.push("a remaining job changed name, schedule, command or state");
      }

      const inspected = (await tx`select job_name from private.inspect_indegenius_cron_jobs() order by job_name`).map(
        (row) => row.job_name
      );
      if (JSON.stringify(inspected) !== JSON.stringify(expected.map((job) => job.jobname))) {
        failures.push(`inspect reports ${inspected.join(", ")}`);
      }

      const refused = await tx
        .savepoint(async (sp) => {
          await sp`select private.dispatch_indegenius_cron(${REMOVED}, '/api/cron/review-reminders')`;
          return false;
        })
        .catch((error) => /not allowed/i.test(String(error?.message)));
      if (!refused) failures.push("dispatch did not refuse the review reminder job");

      if (failures.length > 0) {
        outcome = "failed";
        throw new Error(`verification failed: ${failures.join("; ")}`);
      }

      console.log("  verified: job gone, remaining jobs unchanged, inspect agrees, dispatch refuses it, no telemetry");
      if (mode === "dry-run") {
        outcome = "dry-run clean";
        throw new Error("rollback");
      }
      outcome = "applied";
    })
    .catch((error) => {
      if (error instanceof Error && error.message === "rollback") return;
      throw error;
    });

  console.log(
    outcome === "dry-run clean"
      ? "\nDry run clean. Nothing was committed.\n"
      : outcome === "applied"
        ? "\nApplied and committed.\n"
        : `\nOutcome: ${outcome}\n`
  );
} finally {
  await sql.end({ timeout: 5 });
}
