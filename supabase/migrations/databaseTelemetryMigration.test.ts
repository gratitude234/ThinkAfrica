import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the telemetry migration.
 *
 * There is no local migration runner in this project, so a mistake in this file
 * surfaces in production or not at all. These are the failures worth guarding
 * against, and each of them is a thing that would be silent:
 *
 *   1. Telemetry reachable from the public API. The whole point of putting it
 *      in `private` is that pg_stat_activity excerpts and query text never
 *      become an endpoint.
 *   2. An unbounded job. A capture with no statement timeout, or one scheduled
 *      every minute, turns the diagnostics into another source of load on a
 *      database that is already short of headroom.
 *   3. A destructive statement. Nothing here may drop, truncate or reset
 *      anything, and the only rows it deletes are its own, past retention.
 *   4. A cron job added to some of the four scheduler functions but not the
 *      others. Once a name is out of the remove set nothing unschedules it
 *      again, which is how a job outlives every later migration.
 *   5. An assumed column. Optional statistics columns differ between Postgres
 *      versions, and a capture that hard-codes one records nothing at all on
 *      the day the database is unwell.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function read(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

const telemetry = read("20260908000001_database_telemetry.sql");

/** The migration with every comment line stripped, for assertions about what
 *  it executes rather than what it explains. */
const executableSql = telemetry
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const TELEMETRY_TABLES = [
  "private.db_health_snapshots",
  "private.db_connection_snapshots",
  "private.db_activity_snapshots",
  "private.db_query_snapshots",
];

const TELEMETRY_VIEWS = ["private.db_query_deltas", "private.db_health_deltas"];

const SCHEDULED_JOBS = [
  "indegenius-daily-brief",
  "indegenius-review-reminders",
  "indegenius-publication-recovery",
  "indegenius-resend-segment-sync",
  "indegenius-cron-http-reconcile",
  "indegenius-cron-history-prune",
  "indegenius-db-telemetry",
];

describe("where the telemetry lives", () => {
  it("creates every table and view in the private schema", () => {
    for (const table of TELEMETRY_TABLES) {
      expect(executableSql).toContain(`create table if not exists ${table} (`);
    }
    for (const view of TELEMETRY_VIEWS) {
      expect(executableSql).toContain(`create or replace view ${view} as`);
    }
    // Nothing lands in public, which is the only schema PostgREST exposes.
    expect(executableSql).not.toMatch(/create (table|view|or replace view)\s+(if not exists\s+)?public\./);
  });

  it("puts every function in the private schema", () => {
    const created = executableSql.match(/create or replace function\s+([a-z_.]+)/g) ?? [];
    expect(created.length).toBeGreaterThan(0);
    for (const statement of created) {
      expect(statement).toMatch(/create or replace function\s+private\./);
    }
  });
});

describe("who can read it", () => {
  it("leaves anon and authenticated with nothing", () => {
    for (const object of [...TELEMETRY_TABLES, ...TELEMETRY_VIEWS]) {
      expect(executableSql).toContain(
        `revoke all on ${object} from public, anon, authenticated;`
      );
    }
    expect(executableSql).not.toMatch(/grant[^;]*to\s+anon/);
    expect(executableSql).not.toMatch(/grant[^;]*to\s+authenticated/);
  });

  it("locks every function away from the API roles", () => {
    for (const fn of [
      "private.capture_db_telemetry()",
      "private.capture_db_health_snapshot()",
      "private.capture_db_connection_snapshot(bigint)",
      "private.capture_db_activity_snapshot(bigint, integer, integer)",
      "private.capture_db_query_snapshot(bigint, integer)",
      "private.prune_db_telemetry(interval)",
      "private.db_incident_report(integer, timestamptz)",
    ]) {
      expect(executableSql).toContain(
        `revoke all on function ${fn} from public, anon, authenticated;`
      );
    }
  });

  it("turns RLS on and forces it, so only a BYPASSRLS role gets through", () => {
    for (const table of TELEMETRY_TABLES) {
      expect(executableSql).toContain(`alter table ${table} enable row level security;`);
      expect(executableSql).toContain(`alter table ${table} force row level security;`);
    }
    // RLS on with no policy is the deny-everything state. A policy here would
    // be a way in, not a way to secure it.
    expect(executableSql).not.toContain("create policy");
  });

  it("never asks PostgREST to expose the schema", () => {
    expect(executableSql).not.toContain("notify pgrst");
  });
});

describe("the capture job", () => {
  it("is bounded by a statement timeout and a lock timeout", () => {
    const capture = executableSql.slice(
      executableSql.indexOf("create or replace function private.capture_db_telemetry()")
    );
    expect(capture).toMatch(/set statement_timeout = '\ds'/);
    expect(capture).toMatch(/set lock_timeout = '\ds'/);
  });

  it("runs every five minutes, not every minute", () => {
    // '3-59/5' is every five minutes offset to minute 3, away from the other
    // jobs at minutes 1 and 4.
    expect(executableSql).toContain("'3-59/5 * * * *'");
    expect(executableSql).not.toContain("'* * * * *'");
    expect(executableSql).not.toContain("'*/1 * * * *'");
  });

  it("is scheduled by this file, so applying it is enough", () => {
    expect(executableSql).toMatch(
      /select cron\.schedule\(\s*'indegenius-db-telemetry',\s*'3-59\/5 \* \* \* \*',/
    );
  });

  it("is known to the remove, inspect and install functions alike", () => {
    // A job in install but not remove can never be unscheduled again.
    for (const fn of [
      "private.remove_indegenius_cron_jobs",
      "private.inspect_indegenius_cron_jobs",
      "private.install_indegenius_cron_jobs",
    ]) {
      const start = executableSql.indexOf(`create or replace function ${fn}`);
      expect(start, `${fn} is not redefined`).toBeGreaterThan(-1);
      const body = executableSql.slice(start, executableSql.indexOf("$function$;", start));
      expect(body).toContain("indegenius-db-telemetry");
    }
  });

  it("leaves every other job's schedule exactly as it was", () => {
    for (const job of SCHEDULED_JOBS) {
      expect(executableSql).toContain(`'${job}'`);
    }
    // The HTTP dispatch allowlist is deliberately untouched: this job makes no
    // request to the application, it runs inside the database.
    expect(executableSql).not.toContain("create or replace function private.dispatch_indegenius_cron");
  });

  it("keeps the expensive step last and survives its failure", () => {
    const capture = executableSql.slice(
      executableSql.indexOf("create or replace function private.capture_db_telemetry()")
    );
    const health = capture.indexOf("capture_db_health_snapshot()");
    const queries = capture.indexOf("capture_db_query_snapshot(v_run_id)");
    expect(health).toBeGreaterThan(-1);
    expect(queries).toBeGreaterThan(health);
    expect(capture).toContain("query_capture_error = v_error");
  });
});

describe("optional statistics", () => {
  it("checks the catalogue instead of assuming a column exists", () => {
    expect(executableSql).toContain(
      "create or replace function private.telemetry_column_expr("
    );
    for (const column of [
      "sessions",
      "sessions_abandoned",
      "sessions_fatal",
      "sessions_killed",
      "wal_records",
      "wal_bytes",
      "stats_since",
      "minmax_stats_since",
      "toplevel",
      "query_id",
    ]) {
      expect(executableSql).toContain(`'${column}'`);
    }
  });

  it("checks that pg_stat_io exists before reading it", () => {
    expect(executableSql).toMatch(
      /to_regclass\('pg_catalog\.pg_stat_io'\) is not null/
    );
  });

  it("resolves the pg_stat_statements schema rather than hardcoding it", () => {
    expect(executableSql).toContain("create or replace function private.pgss_schema()");
    expect(executableSql).not.toContain("extensions.pg_stat_statements");
    expect(executableSql).not.toContain("public.pg_stat_statements");
  });

  it("records nothing rather than failing when pg_stat_statements is absent", () => {
    const capture = executableSql.slice(
      executableSql.indexOf("create or replace function private.capture_db_query_snapshot(")
    );
    expect(capture).toMatch(/if v_pgss_schema is null then\s+return 0;/);
  });

  it("aggregates pg_stat_io rather than dumping the whole view", () => {
    // Eight sums, one row. Not thirty-odd rows every five minutes.
    const sums = executableSql.match(/pg_catalog\.sum\(%s\)/g) ?? [];
    expect(sums).toHaveLength(8);
  });
});

describe("what it does to existing data", () => {
  it("contains no destructive statement", () => {
    for (const forbidden of [
      "drop table",
      "drop schema",
      "drop function",
      "drop view",
      "alter table posts",
      "alter table profiles",
    ]) {
      expect(executableSql.toLowerCase()).not.toContain(forbidden);
    }
    expect(executableSql).not.toMatch(/^s*truncate/im);
  });

  it("never resets pg_stat_statements", () => {
    // Accumulated counters are the evidence. Resetting them is the one thing
    // that would destroy what we are here to collect.
    expect(executableSql).not.toContain("pg_stat_statements_reset");
    expect(executableSql).not.toContain("pg_stat_reset");
    expect(executableSql).toContain("create extension if not exists pg_stat_statements");
  });

  it("deletes only telemetry rows, and only past retention", () => {
    const deletes = executableSql.match(/delete from ([a-z_.]+)/g) ?? [];
    expect(deletes.length).toBe(4);
    for (const statement of deletes) {
      expect(statement).toMatch(/delete from private\.db_/);
    }
    expect(executableSql).toContain("p_retain interval default interval '7 days'");
    expect(executableSql).toContain("captured_at < v_cutoff");
  });

  it("does not restart the database or change compute settings", () => {
    for (const forbidden of [
      "alter system",
      "pg_reload_conf",
      "pg_terminate_backend",
      "pg_cancel_backend",
      "shared_preload_libraries =",
    ]) {
      expect(executableSql.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("the deltas", () => {
  it("refuses to subtract across a reset or an eviction", () => {
    // Cumulative counters minus each other is nonsense once the source has been
    // reset. The guard is what makes the number trustworthy.
    expect(executableSql).toContain(
      "paired.stats_since is not distinct from paired.previous_stats_since"
    );
    expect(executableSql).toContain(
      "paired.pgss_stats_reset is not distinct from paired.previous_pgss_stats_reset"
    );
    expect(executableSql).toContain(
      "paired.stats_reset is not distinct from paired.previous_stats_reset"
    );
  });

  it("exposes the deltas the incident report is written against", () => {
    for (const column of [
      "calls_delta",
      "total_exec_time_delta",
      "rows_delta",
      "shared_blks_read_delta",
      "temp_blks_written_delta",
      "mean_exec_time_delta",
      "temp_bytes_delta",
      "deadlocks_delta",
      "xact_rollback_delta",
      "cache_hit_percent",
    ]) {
      expect(executableSql).toContain(`as ${column}`);
    }
  });
});

describe("the incident report", () => {
  it("covers every section the on-call reader needs", () => {
    for (const section of [
      "1_window",
      "2_health",
      "3_top_queries",
      "4_connection_sources",
      "5_long_running",
      "6_limits",
    ]) {
      expect(executableSql).toContain(`'${section}'::text as section`);
    }
  });

  it("states plainly what SQL telemetry cannot see", () => {
    expect(executableSql).toContain("host RAM, swap usage and the Linux OOM killer");
    expect(executableSql).toContain("platform CPU and disk saturation");
  });
});

describe("privacy of captured text", () => {
  it("truncates both sources of statement text", () => {
    // pg_stat_activity.query carries literal parameter values.
    expect(executableSql).toContain("pg_catalog.left(activity.query, 200)");
    // pg_stat_statements normalises literals to $1, $2, but it is still capped.
    expect(executableSql).toContain("pg_catalog.left(statements.query, 500)");
  });

  it("stores aggregates of pg_stat_activity, not a copy of it", () => {
    const connectionCapture = executableSql.slice(
      executableSql.indexOf(
        "create or replace function private.capture_db_connection_snapshot("
      ),
      executableSql.indexOf(
        "create or replace function private.capture_db_activity_snapshot("
      )
    );
    expect(connectionCapture).toContain("pg_catalog.count(*)::integer");
    expect(connectionCapture).toContain("group by");
    // query_start is fine; the statement text itself is what must not be here.
    expect(connectionCapture).not.toMatch(/activity.query(?!_)/);
  });

  it("keeps the long-running list short and only for genuinely stuck backends", () => {
    expect(executableSql).toContain("p_min_age_ms integer default 5000");
    expect(executableSql).toContain("p_limit integer default 5");
  });
});

describe("query capture volume", () => {
  it("takes the top rows of four rankings, not the whole view", () => {
    expect(executableSql).toContain("p_per_ranking integer default 8");
    for (const reason of ["'total_time'", "'mean_time'", "'max_time'", "'temp'"]) {
      expect(executableSql).toContain(reason);
    }
    // Deduplicated, so four rankings of eight are roughly twenty to thirty
    // rows rather than thirty-two.
    expect(executableSql).toContain("group by ranked.queryid, ranked.userid, ranked.dbid, ranked.toplevel");
  });
});

describe("the Debate subsystem", () => {
  it("is not reintroduced by this migration", () => {
    expect(telemetry.toLowerCase()).not.toContain("debate");
  });
});
