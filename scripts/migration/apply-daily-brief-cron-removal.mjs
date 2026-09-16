/**
 * Applies 20260915000002_remove_daily_brief_cron_job.sql.
 *
 *   node scripts/migration/apply-daily-brief-cron-removal.mjs --dry-run
 *   node scripts/migration/apply-daily-brief-cron-removal.mjs --apply
 *
 * The same workflow as apply-cron-removal.mjs: there is no local migration
 * runner, so the reviewed file is sent over the direct connection inside one
 * transaction with a lock timeout.
 *
 * The file must follow 20260914000001_remove_review_reminders_cron_job.sql,
 * and refuses to run otherwise. So that the pair can be verified against a
 * database that has applied neither, `--dry-run` rehearses 20260914000001
 * first, inside the same transaction, when it finds that one unapplied.
 * `--apply` never does: it refuses and names the script to run first.
 *
 * Both modes verify the result inside the transaction before it ends:
 *
 *   - the daily brief job is no longer in cron.job;
 *   - neither is the review reminder job;
 *   - every other Indegenius job is exactly as it was, schedule and command;
 *   - inspect_indegenius_cron_jobs() reports exactly the remaining set;
 *   - dispatch refuses both removed job/path pairs;
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

const FILE = "20260915000002_remove_daily_brief_cron_job.sql";
const PREREQUISITE = "20260914000001_remove_review_reminders_cron_job.sql";
const REMOVED = "indegenius-daily-brief";
const PREREQUISITE_REMOVED = "indegenius-review-reminders";

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

let outcome = "unknown";
try {
  await sql
    .begin(async (tx) => {
      await tx.unsafe("set local lock_timeout = '5s'");

      const before = await jobsQuery(tx);
      console.log(`Before: ${before.map((job) => job.jobname).join(", ")}`);

      const [{ pending }] = await tx`
        select (
          exists (select 1 from cron.job where jobname = ${PREREQUISITE_REMOVED})
          or pg_catalog.strpos(
            pg_catalog.pg_get_functiondef('private.remove_indegenius_cron_jobs()'::pg_catalog.regprocedure),
            ${PREREQUISITE_REMOVED}
          ) > 0
        ) as pending`;

      if (pending) {
        if (mode === "apply") {
          outcome = "refused";
          throw new Error(
            `${PREREQUISITE} has not been applied here. Run scripts/migration/apply-cron-removal.mjs --apply first.`
          );
        }
        console.log(`  ${PREREQUISITE} is not applied here yet. Rehearsing it first, in this same rolled-back transaction.`);
        const started = Date.now();
        await tx.unsafe(statements(PREREQUISITE));
        console.log(`  would apply ${PREREQUISITE}  ${Date.now() - started}ms`);
      }

      const started = Date.now();
      await tx.unsafe(statements(FILE));
      console.log(`  ${mode === "apply" ? "applied" : "would apply"} ${FILE}  ${Date.now() - started}ms`);

      const after = await jobsQuery(tx);
      console.log(`After:  ${after.map((job) => job.jobname).join(", ")}`);

      const failures = [];
      if (after.some((job) => job.jobname === REMOVED)) failures.push("daily brief job still scheduled");
      if (after.some((job) => job.jobname === PREREQUISITE_REMOVED)) failures.push("review reminder job still scheduled");
      if (after.some((job) => job.jobname === "indegenius-db-telemetry")) failures.push("telemetry job present");

      const expected = before.filter(
        (job) => job.jobname !== REMOVED && job.jobname !== PREREQUISITE_REMOVED
      );
      if (JSON.stringify(expected) !== JSON.stringify(after)) {
        failures.push("a remaining job changed name, schedule, command or state");
      }

      const inspected = (await tx`select job_name from private.inspect_indegenius_cron_jobs() order by job_name`).map(
        (row) => row.job_name
      );
      if (JSON.stringify(inspected) !== JSON.stringify(expected.map((job) => job.jobname))) {
        failures.push(`inspect reports ${inspected.join(", ")}`);
      }

      if (!(await refuses(tx, REMOVED, "/api/cron/daily-brief"))) {
        failures.push("dispatch did not refuse the daily brief job");
      }
      if (!(await refuses(tx, PREREQUISITE_REMOVED, "/api/cron/review-reminders"))) {
        failures.push("dispatch did not refuse the review reminder job");
      }

      if (failures.length > 0) {
        outcome = "failed";
        throw new Error(`verification failed: ${failures.join("; ")}`);
      }

      console.log(
        "  verified: both jobs gone, remaining jobs unchanged, inspect agrees, dispatch refuses both, no telemetry"
      );
      if (mode === "dry-run") {
        outcome = pending ? "dry-run clean (with prerequisite rehearsed)" : "dry-run clean";
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
