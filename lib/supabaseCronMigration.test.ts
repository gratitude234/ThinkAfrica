import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260827110918_migrate_scheduler_to_supabase_cron.sql"
);
const sql = readFileSync(migrationPath, "utf8");

const expectedJobs = new Map([
  ["indegenius-daily-brief", "0 8 * * *"],
  ["indegenius-review-reminders", "0 9 * * *"],
  ["indegenius-debate-v2-advance", "*/5 * * * *"],
  ["indegenius-debate-v2-notifications", "2-59/5 * * * *"],
  ["indegenius-publication-recovery", "4-59/5 * * * *"],
  ["indegenius-debate-v15-deadlines", "7,22,37,52 * * * *"],
  ["indegenius-cron-http-reconcile", "1-59/5 * * * *"],
  ["indegenius-cron-history-prune", "30 3 * * *"],
]);

describe("Supabase Cron migration", () => {
  it("installs the required extensions and keeps activation explicit", () => {
    expect(sql).toMatch(
      /create extension if not exists pg_cron with schema pg_catalog/i
    );
    expect(sql).toMatch(
      /create extension if not exists pg_net with schema extensions/i
    );
    expect(sql).not.toMatch(
      /(?:select|perform)\s+private\.install_indegenius_cron_jobs\s*\(/i
    );
  });

  it("defines exactly the approved job names and UTC schedules", () => {
    const scheduled = [
      ...sql.matchAll(
        /perform\s+cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'/gi
      ),
    ].map((match) => [match[1], match[2]] as const);

    expect(new Map(scheduled)).toEqual(expectedJobs);
    expect(scheduled).toHaveLength(expectedJobs.size);
  });

  it("whitelists only the protected application worker paths", () => {
    const expectedPaths = [
      "/api/cron/health",
      "/api/cron/daily-brief",
      "/api/cron/review-reminders",
      "/api/cron/advance-debate-rounds",
      "/api/cron/process-debate-notifications",
      "/api/cron/process-publication-deliveries",
      "/api/cron/debate-v15-deadlines",
    ];

    for (const path of expectedPaths) {
      expect(sql).toContain(path);
    }

    expect(sql).toMatch(
      /if v_expected_path is null or p_path is distinct from v_expected_path/i
    );
  });

  it("keeps the audit ledger private and gives pending responses a partial index", () => {
    expect(sql).toMatch(/create schema if not exists private/i);
    expect(sql).toMatch(/revoke all on schema private from public/i);
    expect(sql).toMatch(/revoke all on schema private from anon/i);
    expect(sql).toMatch(/revoke all on schema private from authenticated/i);
    expect(sql).toMatch(
      /create index if not exists cron_http_requests_pending_idx[\s\S]*where reconciled_at is null/i
    );
    expect(sql).toMatch(
      /alter table private\.cron_http_requests force row level security/i
    );
  });

  it("retains only 30 days of Indegenius-owned audit and cron history", () => {
    expect(sql).toMatch(
      /delete from private\.cron_http_requests[\s\S]*interval '30 days'/i
    );
    expect(sql).toMatch(
      /delete from cron\.job_run_details[\s\S]*dispatch_indegenius_cron/i
    );
    expect(sql).toContain(
      "select private.reconcile_indegenius_cron_http_requests();"
    );
    expect(sql).toContain(
      "select private.prune_indegenius_cron_history();"
    );
  });

  it("uses supported cron APIs and never writes cron.job directly", () => {
    expect(sql).toContain("cron.schedule(");
    expect(sql).toContain("cron.unschedule(");
    expect(sql).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+cron\.job\b/i
    );
  });

  it("resolves runtime configuration from Vault without literal destinations or secrets", () => {
    expect(sql).toContain("indegenius_cron_base_url");
    expect(sql).toContain("indegenius_cron_secret");
    expect(sql).not.toContain("https://www.indegenius.africa");
    expect(sql).not.toContain("process.env.CRON_SECRET");

    const localCronSecret = process.env.CRON_SECRET;
    if (localCronSecret) {
      expect(sql).not.toContain(localCronSecret);
    }
  });
});
