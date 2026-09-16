/**
 * Applies 20260915000003_remove_publication_recovery_cron_job.sql.
 *
 *   node scripts/migration/apply-publication-recovery-cron-removal.mjs --dry-run
 *   node scripts/migration/apply-publication-recovery-cron-removal.mjs --apply
 *
 * The same workflow as apply-daily-brief-cron-removal.mjs: there is no local
 * migration runner, so the reviewed file is sent over the direct connection
 * inside one transaction with a lock timeout.
 *
 * The file must follow 20260914000001_remove_review_reminders_cron_job.sql and
 * 20260915000002_remove_daily_brief_cron_job.sql, and refuses to run
 * otherwise. So that all three can be verified against a database that has
 * applied none of them, `--dry-run` rehearses each unapplied prerequisite
 * first, in order, inside the same transaction. `--apply` never does: it
 * refuses and names the script to run first.
 *
 * Both modes verify the result inside the transaction before it ends:
 *
 *   - the publication recovery job is no longer in cron.job;
 *   - neither is the review reminder job or the daily brief job;
 *   - every other Indegenius job is exactly as it was, schedule and command;
 *   - inspect_indegenius_cron_jobs() reports exactly the remaining set;
 *   - dispatch refuses all three removed job/path pairs;
 *   - no telemetry job exists.
 *
 * `--dry-run` then rolls back. `--apply` commits only if every check passed,
 * and rolls back otherwise.
 *
 * Nothing printed carries a secret: jobs are listed by name and schedule.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postgres from "postgres";

import { loadEnv, resolveSupabaseUrl } from "./env.mjs";

loadEnv();

const FILE = "20260915000003_remove_publication_recovery_cron_job.sql";
const REMOVED = "indegenius-publication-recovery";
const REMOVED_PATH = "/api/cron/process-publication-deliveries";

/** In the order they must be applied. */
const PREREQUISITES = [
  {
    file: "20260914000001_remove_review_reminders_cron_job.sql",
    job: "indegenius-review-reminders",
    path: "/api/cron/review-reminders",
    script: "scripts/migration/apply-cron-removal.mjs",
  },
  {
    file: "20260915000002_remove_daily_brief_cron_job.sql",
    job: "indegenius-daily-brief",
    path: "/api/cron/daily-brief",
    script: "scripts/migration/apply-daily-brief-cron-removal.mjs",
  },
];

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : null;

if (!mode) {
  console.error("\nPass --dry-run or --apply.\n");
  process.exit(2);
}

/** A migration file, with its own transaction boundary removed so the caller owns it. */
function statements(file) {
  return readFileSync(resolve("supabase/migrations", file), "utf8")
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

async function refuses(tx, job, path) {
  return tx
    .savepoint(async (sp) => {
      await sp`select private.dispatch_indegenius_cron(${job}, ${path})`;
      return false;
    })
    .catch((error) => /not allowed/i.test(String(error?.message)));
}

async function isPending(tx, job) {
  const [{ pending }] = await tx`
    select (
      exists (select 1 from cron.job where jobname = ${job})
      or pg_catalog.strpos(
        pg_catalog.pg_get_functiondef('private.remove_indegenius_cron_jobs()'::pg_catalog.regprocedure),
        ${job}
      ) > 0
    ) as pending`;
  return pending;
}

let outcome = "unknown";
try {
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local lock_timeout = '5s'");

      const before = await jobsQuery(tx);
      console.log(`Before: ${before.map((job) => job.jobname).join(", ")}`);

      let rehearsed = 0;
      for (const prerequisite of PREREQUISITES) {
        if (!(await isPending(tx, prerequisite.job))) continue;
        if (mode === "apply") {
          outcome = "refused";
          throw new Error(
            `${prerequisite.file} has not been applied here. Run ${prerequisite.script} --apply first.`
          );
        }
        console.log(`  ${prerequisite.file} is not applied here yet. Rehearsing it first, in this same rolled-back transaction.`);
        const started = Date.now();
        await tx.unsafe(statements(prerequisite.file));
        console.log(`  would apply ${prerequisite.file}  ${Date.now() - started}ms`);
        rehearsed += 1;
      }

      const started = Date.now();
      await tx.unsafe(statements(FILE));
      console.log(`  ${mode === "apply" ? "applied" : "would apply"} ${FILE}  ${Date.now() - started}ms`);

      const after = await jobsQuery(tx);
      console.log(`After:  ${after.map((job) => job.jobname).join(", ")}`);

      const removedJobs = [REMOVED, ...PREREQUISITES.map((prerequisite) => prerequisite.job)];
      const failures = [];
      for (const job of removedJobs) {
        if (after.some((row) => row.jobname === job)) failures.push(`${job} still scheduled`);
      }
      if (after.some((job) => job.jobname === "indegenius-db-telemetry")) failures.push("telemetry job present");

      const expected = before.filter((job) => !removedJobs.includes(job.jobname));
      if (JSON.stringify(expected) !== JSON.stringify(after)) {
        failures.push("a remaining job changed name, schedule, command or state");
      }

      const inspected = (await tx`select job_name from private.inspect_indegenius_cron_jobs() order by job_name`).map(
        (row) => row.job_name
      );
      if (JSON.stringify(inspected) !== JSON.stringify(expected.map((job) => job.jobname))) {
        failures.push(`inspect reports ${inspected.join(", ")}`);
      }

      for (const [job, path] of [
        [REMOVED, REMOVED_PATH],
        ...PREREQUISITES.map((prerequisite) => [prerequisite.job, prerequisite.path]),
      ]) {
        if (!(await refuses(tx, job, path))) failures.push(`dispatch did not refuse ${job}`);
      }

      if (failures.length > 0) {
        outcome = "failed";
        throw new Error(`verification failed: ${failures.join("; ")}`);
      }

      console.log(
        "  verified: all three jobs gone, remaining jobs unchanged, inspect agrees, dispatch refuses all three, no telemetry"
      );
      if (mode === "dry-run") {
        outcome =
          rehearsed > 0
            ? `dry-run clean (with ${rehearsed} prerequisite${rehearsed === 1 ? "" : "s"} rehearsed)`
            : "dry-run clean";
        throw new Error("rollback");
      }
      outcome = "applied";
    })
    .catch((error) => {
      if (error instanceof Error && error.message === "rollback") return;
      throw error;
    });

  console.log(
    outcome.startsWith("dry-run clean")
      ? `\n${outcome[0].toUpperCase()}${outcome.slice(1)}. Nothing was committed.\n`
      : outcome === "applied"
        ? "\nApplied and committed.\n"
        : `\nOutcome: ${outcome}\n`
  );
} finally {
  await sql.end({ timeout: 5 });
}
