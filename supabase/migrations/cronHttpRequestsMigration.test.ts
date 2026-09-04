import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the cron dispatch log.
 *
 * There is no local migration runner in this project, so the only thing that
 * catches request_id going back to being a primary key is a test that reads
 * the SQL. The defect it guards against is not theoretical: pg_net reissued
 * request id 297, the insert at the end of dispatch_indegenius_cron() failed
 * with 23505, and the HTTP call it was recording had already gone out.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function read(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

const original = read("20260827110918_migrate_scheduler_to_supabase_cron.sql");
const surrogateKey = read("20260904000001_cron_http_requests_surrogate_key.sql");

describe("the cron http request log", () => {
  it("was originally keyed on the pg_net request id, which is the bug", () => {
    // Pinned so this test still means something if the original is ever read
    // as evidence that the key was always a surrogate.
    expect(original).toMatch(/request_id bigint primary key/i);
  });

  it("gets a database-generated key of its own", () => {
    expect(surrogateKey).toMatch(
      /add column if not exists id bigint generated always as identity/i
    );
    expect(surrogateKey).toMatch(
      /add constraint cron_http_requests_pkey primary key \(id\)/i
    );
  });

  it("drops whatever primary key it finds rather than trusting a name", () => {
    // Re-applying has to be a no-op, and the constraint name is not something
    // this migration is entitled to assume.
    expect(surrogateKey).toMatch(/contype = 'p'/);
    expect(surrogateKey).toMatch(/drop constraint %I/);
  });

  it("keeps request_id as an indexed lookup, not a unique identifier", () => {
    expect(surrogateKey).toMatch(
      /create index if not exists cron_http_requests_request_id_idx\s+on private\.cron_http_requests \(request_id\)/i
    );
    // An index, not a unique index: two rows may legitimately carry the same
    // pg_net id once its sequence has restarted.
    expect(surrogateKey).not.toMatch(/unique index[\s\S]*request_id/i);
    expect(surrogateKey).toMatch(/alter column request_id set not null/i);
  });

  it("preserves history rather than starting the table again", () => {
    expect(surrogateKey).not.toMatch(/drop table/i);
    expect(surrogateKey).not.toMatch(/truncate/i);
    expect(surrogateKey).not.toMatch(
      /delete from private\.cron_http_requests/i
    );
  });
});

describe("reconciling responses against the new key", () => {
  const reconcile = surrogateKey.slice(
    surrogateKey.indexOf(
      "create or replace function private.reconcile_indegenius_cron_http_requests"
    ),
    surrogateKey.indexOf(
      "create or replace function private.inspect_indegenius_cron_jobs"
    )
  );

  it("updates rows by the surrogate key", () => {
    expect(reconcile).toMatch(/where requests\.id = matched\.request_row_id/);
  });

  it("gives a pg_net response to at most one request row", () => {
    // Two rows can share a request_id after a sequence restart. Only the
    // newest unreconciled one can plausibly own the response still retained.
    expect(reconcile).toMatch(/distinct on \(requests\.request_id\)/);
    expect(reconcile).toMatch(
      /order by requests\.request_id, requests\.requested_at desc, requests\.id desc/
    );
  });

  it("still closes out requests whose response was never retained", () => {
    expect(reconcile).toMatch(
      /requested_at < pg_catalog\.now\(\) - interval '15 minutes'/
    );
  });
});

describe("inspecting the jobs", () => {
  it("breaks a tie on the surrogate key so the last result is stable", () => {
    expect(surrogateKey).toMatch(
      /order by requests\.requested_at desc, requests\.id desc/
    );
  });

  it("still names every scheduled job, including the recipient sync", () => {
    // inspect_indegenius_cron_jobs lists the expected set explicitly, so a
    // redefinition that drops one silently stops reporting on it.
    for (const job of [
      "indegenius-daily-brief",
      "indegenius-review-reminders",
      "indegenius-debate-v2-advance",
      "indegenius-debate-v2-notifications",
      "indegenius-publication-recovery",
      "indegenius-debate-v15-deadlines",
      "indegenius-resend-segment-sync",
      "indegenius-cron-http-reconcile",
      "indegenius-cron-history-prune",
    ]) {
      expect(surrogateKey).toContain(`('${job}'`);
    }
  });
});
