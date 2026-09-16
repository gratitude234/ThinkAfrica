import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the migration that removes the daily brief job.
 *
 * There is no local migration runner, so a mistake here surfaces in production
 * or not at all. The file is written on top of
 * 20260914000001_remove_review_reminders_cron_job.sql, which is itself written
 * against production's scheduler. These tests derive the expected definitions
 * from that file on every run, so the migration cannot drift from the shape it
 * claims to target, and they prove it cannot run out of order or introduce the
 * telemetry job.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FILE = "20260915000002_remove_daily_brief_cron_job.sql";
const PREVIOUS = "20260914000001_remove_review_reminders_cron_job.sql";

function read(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8").replace(/\r\n/g, "\n");
}

const cron = read(FILE);
const previous = read(PREVIOUS);

/** Statements only, for assertions about what runs rather than what is explained. */
const executableSql = cron
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const REMOVED_JOB = "indegenius-daily-brief";
const REMOVED_PATH = "/api/cron/daily-brief";
const EARLIER_REMOVED_JOB = "indegenius-review-reminders";
const EARLIER_REMOVED_PATH = "/api/cron/review-reminders";

const SCHEDULER_FUNCTIONS = [
  "dispatch_indegenius_cron",
  "remove_indegenius_cron_jobs",
  "inspect_indegenius_cron_jobs",
  "install_indegenius_cron_jobs",
] as const;

/** Production's jobs after both removals, with their UTC schedules. */
const REMAINING_JOBS: Array<[string, string]> = [
  ["indegenius-cron-history-prune", "30 3 * * *"],
  ["indegenius-cron-http-reconcile", "1-59/5 * * * *"],
  ["indegenius-publication-recovery", "4-59/5 * * * *"],
  ["indegenius-resend-segment-sync", "20 2 * * *"],
];

const DISPATCHED_PATHS: Array<[string, string]> = [
  ["indegenius-health-probe", "/api/cron/health"],
  ["indegenius-publication-recovery", "/api/cron/process-publication-deliveries"],
  ["indegenius-resend-segment-sync", "/api/cron/resend-segment-sync"],
];

/**
 * The one comment inside install that named the job by its schedule rather
 * than its name, and what the migration writes instead. Stated here so the
 * derivation below is exact rather than approximate.
 */
const INSTALL_COMMENT_BEFORE =
  "  -- 02:20 UTC: after the day's activity has settled and well before the\n" +
  "  -- 08:00 daily brief, so a long bootstrap run does not collide with it.\n";
const INSTALL_COMMENT_AFTER =
  "  -- 02:20 UTC: after the day's activity has settled, so a long bootstrap\n" +
  "  -- run does not collide with daytime traffic.\n";

/** A whole `create or replace function ... $function$;` statement. */
function definition(sql: string, fn: string): string | null {
  const start = sql.indexOf(`create or replace function private.${fn}(`);
  if (start === -1) return null;
  const open = sql.indexOf("$function$", start);
  const close = sql.indexOf("$function$;", open + "$function$".length);
  if (open === -1 || close === -1) return null;
  return sql.slice(start, close + "$function$;".length);
}

/** Every line naming the removed job, gone; the install comment rewritten; nothing else touched. */
function withoutRemovedJob(text: string) {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes("perform cron.schedule(") && lines[index + 1]?.includes(REMOVED_JOB)) {
      // The install block is five lines: the call, its three arguments, the close.
      index += 4;
      continue;
    }
    if (line.includes(REMOVED_JOB)) continue;
    out.push(line);
  }
  return out.join("\n").replace(INSTALL_COMMENT_BEFORE, INSTALL_COMMENT_AFTER);
}

function newestDefinition(fn: string) {
  let newest: { file: string; body: string } | null = null;
  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    const body = definition(read(file), fn);
    if (body !== null) newest = { file, body };
  }
  if (!newest) throw new Error(`${fn} is not defined by any migration`);
  return newest;
}

describe("removing the daily brief job from the production scheduler", () => {
  it("redefines all four functions exactly as 20260914000001 does, minus that job", () => {
    expect(previous).toContain(INSTALL_COMMENT_BEFORE);
    for (const fn of SCHEDULER_FUNCTIONS) {
      const expected = definition(previous, fn);
      const actual = definition(cron, fn);
      expect(expected, `${fn} in ${PREVIOUS}`).not.toBeNull();
      expect(actual, `${fn} in ${FILE}`).not.toBeNull();
      expect(actual, fn).toBe(withoutRemovedJob(expected!));
    }
  });

  it("follows 20260914000001 in migration order", () => {
    expect(FILE > PREVIOUS).toBe(true);
  });

  it("cannot introduce database telemetry", () => {
    const afterGuards = executableSql.slice(executableSql.indexOf("perform cron.unschedule"));
    expect(afterGuards).not.toMatch(/telemetry/i);

    const install = definition(cron, "install_indegenius_cron_jobs")!;
    const scheduled = [...install.matchAll(/cron\.schedule\(\s*'([^']+)',\s*'([^']+)',/g)].map(
      (match) => [match[1], match[2]] as [string, string]
    );
    expect(scheduled.sort()).toEqual([...REMAINING_JOBS].sort());
  });

  it("refuses to run on a database that already has telemetry, before changing anything", () => {
    const guard = cron.indexOf("jobname = 'indegenius-db-telemetry'");
    expect(guard).toBeGreaterThan(-1);
    expect(cron.slice(guard, guard + 600)).toContain("p.proname = 'capture_db_telemetry'");
    expect(cron.slice(guard, guard + 800)).toMatch(/raise exception/);
    expect(guard).toBeLessThan(cron.indexOf("perform cron.unschedule"));
    expect(guard).toBeLessThan(cron.indexOf("create or replace function"));
  });

  it("refuses to run before 20260914000001 has removed the review reminder job", () => {
    // Out of order, these definitions would forget the review reminder job
    // while it is still scheduled, and nothing would ever unschedule it.
    const guard = cron.indexOf(`jobname = '${EARLIER_REMOVED_JOB}'`);
    expect(guard).toBeGreaterThan(-1);
    const body = cron.slice(guard, guard + 700);
    expect(body).toContain("pg_get_functiondef('private.remove_indegenius_cron_jobs()'");
    expect(body).toContain(`'${EARLIER_REMOVED_JOB}'`);
    expect(body).toMatch(/raise exception/);
    expect(guard).toBeLessThan(cron.indexOf("perform cron.unschedule"));
    expect(guard).toBeLessThan(cron.indexOf("create or replace function"));
  });

  it("unschedules the job in this file, before the functions forget it", () => {
    const unschedule = cron.slice(0, cron.indexOf("create or replace function"));
    expect(unschedule).toContain(`'${REMOVED_JOB}'`);
    expect(unschedule).toContain("perform cron.unschedule(v_job.jobid)");
    expect(cron).toMatch(/select\s+jobid, jobname\s+from cron\.job/i);
    expect(cron).not.toMatch(/cron\.unschedule\(\s*'indegenius-/i);
  });

  it("names neither removed job nor either route in the four functions", () => {
    const functions = cron.slice(cron.indexOf("create or replace function"));
    for (const retired of [REMOVED_JOB, REMOVED_PATH, EARLIER_REMOVED_JOB, EARLIER_REMOVED_PATH]) {
      expect(functions).not.toContain(retired);
    }
    expect(functions).not.toMatch(/daily brief/i);
  });

  it("keeps every remaining job in remove, inspect and install alike", () => {
    const remove = definition(cron, "remove_indegenius_cron_jobs")!;
    const inspect = definition(cron, "inspect_indegenius_cron_jobs")!;
    for (const [job, schedule] of REMAINING_JOBS) {
      expect(remove, job).toContain(`'${job}'`);
      expect(inspect, job).toContain(`('${job}', '${schedule}')`);
    }
  });

  it("keeps the dispatch allowlist for every job that calls the application", () => {
    const dispatch = definition(cron, "dispatch_indegenius_cron")!;
    for (const [job, path] of DISPATCHED_PATHS) {
      expect(dispatch, job).toContain(`when '${job}' then '${path}'`);
    }
    expect(dispatch).toMatch(/if v_expected_path is null or p_path is distinct from v_expected_path/i);
    expect(cron).toContain("indegenius_cron_base_url");
    expect(cron).toContain("indegenius_cron_secret");
    expect(cron).not.toContain("https://www.indegenius.africa");
  });

  it("changes the scheduler and nothing else", () => {
    const created = [...executableSql.matchAll(/create or replace function\s+private\.([a-z_]+)/gi)].map(
      (match) => match[1]
    );
    expect(created.sort()).toEqual([...SCHEDULER_FUNCTIONS].sort());
    expect(executableSql).not.toMatch(/\bdrop\s+(table|function|schema|view|column|policy)\b/i);
    expect(executableSql).not.toMatch(/\balter\s+table\b/i);
    expect(executableSql).not.toMatch(/\bdelete\s+from\b/i);
    expect(executableSql).not.toMatch(/\btruncate\b/i);
    expect(executableSql).not.toMatch(/\bupdate\s+(public|cron|private)\./i);
  });

  it("is the newest definition of each function, and none names either removed job", () => {
    for (const fn of SCHEDULER_FUNCTIONS) {
      const newest = newestDefinition(fn);
      expect(newest.file >= FILE, `${fn} was last defined by ${newest.file}`).toBe(true);
      expect(newest.body, fn).not.toContain(REMOVED_JOB);
      expect(newest.body, fn).not.toContain(EARLIER_REMOVED_JOB);
    }
  });

  it("removes the route the job called", () => {
    expect(existsSync(join(process.cwd(), "app", "api", "cron", "daily-brief"))).toBe(false);
  });
});
