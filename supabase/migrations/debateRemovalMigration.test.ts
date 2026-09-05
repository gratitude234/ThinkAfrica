import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the two migrations that remove Debate.
 *
 * There is no local migration runner in this project, so a mistake in either
 * file surfaces in production or not at all. The two failures worth guarding
 * against are specific:
 *
 *   1. A Debate cron job dropped from install but left in the remove set, or
 *      the reverse. Once a name is out of the remove set, nothing unschedules
 *      it ever again, so the running job outlives every later migration.
 *   2. A shared database object left pointing at a table the schema migration
 *      drops. Messaging, the public record index and the credibility summary
 *      all read Debate tables, and a drop without the redefinition takes them
 *      down with it.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function read(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

const cron = read("20260906000003_remove_debate_cron_jobs.sql");
const schema = read("20260906000004_remove_debate_schema.sql");

/** The schema migration with every comment line stripped, for assertions that
 *  are about what it executes rather than what it explains. */
const executableSql = schema
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const REMOVED_JOBS = [
  "indegenius-debate-v2-advance",
  "indegenius-debate-v2-notifications",
  "indegenius-debate-v15-deadlines",
];

const REMOVED_PATHS = [
  "/api/cron/advance-debate-rounds",
  "/api/cron/process-debate-notifications",
  "/api/cron/debate-v15-deadlines",
];

const SURVIVING_JOBS = [
  "indegenius-daily-brief",
  "indegenius-review-reminders",
  "indegenius-publication-recovery",
  "indegenius-resend-segment-sync",
  "indegenius-cron-http-reconcile",
  "indegenius-cron-history-prune",
];

describe("removing the Debate cron jobs", () => {
  it("unschedules them in this file rather than leaving it to a reinstall", () => {
    // The load-bearing detail. remove_indegenius_cron_jobs() stops knowing
    // these names further down the same file, so if the unschedule is not here
    // it never happens.
    const unschedule = cron.slice(0, cron.indexOf("create or replace function"));
    for (const job of REMOVED_JOBS) {
      expect(unschedule).toContain(`'${job}'`);
    }
    expect(unschedule).toContain("perform cron.unschedule(v_job.jobid)");
  });

  it("resolves job ids from the catalogue instead of hardcoding them", () => {
    expect(cron).toMatch(/select\s+jobid, jobname\s+from cron\.job/i);
    // cron.unschedule(name) raises when the job is absent, which would abort
    // the migration on a database where these were never installed.
    expect(cron).not.toMatch(/cron\.unschedule\(\s*'indegenius-/i);
  });

  it("removes them from all four scheduler functions at once", () => {
    for (const fn of [
      "private.dispatch_indegenius_cron",
      "private.remove_indegenius_cron_jobs",
      "private.inspect_indegenius_cron_jobs",
      "private.install_indegenius_cron_jobs",
    ]) {
      expect(cron).toContain(`create or replace function ${fn}`);
    }

    // Past the unschedule block, no Debate job or route may be named again.
    const functions = cron.slice(cron.indexOf("create or replace function"));
    for (const job of REMOVED_JOBS) {
      expect(functions, job).not.toContain(job);
    }
    for (const path of REMOVED_PATHS) {
      expect(functions, path).not.toContain(path);
    }
  });

  it("leaves every job that is not Debate exactly where it was", () => {
    for (const job of SURVIVING_JOBS) {
      expect(cron, job).toContain(job);
    }
    expect(cron).toContain("/api/cron/daily-brief");
    expect(cron).toContain("/api/cron/review-reminders");
    expect(cron).toContain("/api/cron/process-publication-deliveries");
    expect(cron).toContain("/api/cron/resend-segment-sync");
    expect(cron).toContain("/api/cron/health");
  });

  it("keeps resolving runtime configuration from Vault", () => {
    expect(cron).toContain("indegenius_cron_base_url");
    expect(cron).toContain("indegenius_cron_secret");
    expect(cron).not.toContain("https://www.indegenius.africa");
  });
});

describe("removing the Debate schema", () => {
  it("redefines every shared object before dropping the tables it reads", () => {
    const firstDrop = schema.indexOf("drop table if exists public.debate");
    expect(firstDrop).toBeGreaterThan(-1);

    const beforeDrops = schema.slice(0, firstDrop);
    for (const object of [
      "public.find_or_create_conversation",
      "public.profile_record_entries",
      "public.get_public_profile_record_summary",
      "public.get_public_credibility_summary",
    ]) {
      expect(beforeDrops, object).toContain(object);
    }
  });

  it("keeps messaging's other three eligibility paths", () => {
    const conversation = schema.slice(
      schema.indexOf("create or replace function public.find_or_create_conversation"),
      schema.indexOf("-- 2. The public record index")
    );

    expect(conversation).toContain("public.follows");
    expect(conversation).toContain("theirs.university = mine.university");
    expect(conversation).toContain("public.talent_profiles");
    expect(conversation).toContain("Conversation not allowed.");
    // The gate itself must survive: verification is still required.
    expect(conversation).toContain(
      "Account verification required to send messages."
    );
    // And the conversation is still created the same way.
    expect(conversation).toContain("public.conversation_participants");
    expect(conversation).not.toContain("debate");
  });

  it("keeps the record index a security-barrier invoker view", () => {
    expect(schema).toContain(
      "with (security_invoker = true, security_barrier = true)"
    );
    // Dropping and recreating would lose the grants for as long as the
    // transaction runs; replace keeps the column list and the grants.
    expect(schema).toContain(
      "create or replace view public.profile_record_entries"
    );
  });

  it("deletes the Debate notifications before narrowing the constraint", () => {
    const deletion = schema.indexOf("delete from public.notifications");
    const narrowing = schema.indexOf("notifications_type_check");
    expect(deletion).toBeGreaterThan(-1);
    expect(deletion).toBeLessThan(narrowing);
  });

  it("narrows the notification constraint by reading the live definition", () => {
    // Restating a list this migration cannot know is current is how an
    // unrelated type gets dropped by accident.
    expect(schema).toContain("pg_get_constraintdef(con.oid)");
    expect(schema).toContain("where value not like 'debate%'");
    expect(schema).toMatch(
      /raise exception 'notifications_type_check not found/i
    );
  });

  it("strips the Debate preference keys without touching the rest", () => {
    expect(schema).toContain("- 'inapp_debates'");
    expect(schema).toContain("- 'email_debate_updates'");
    expect(schema).toContain("- 'push_debate_updates'");

    const allowlist = schema.slice(
      schema.indexOf("create or replace function public.set_notification_preference"),
      schema.indexOf("-- 6. Historical Debate notifications")
    );
    expect(allowlist).toContain("'email_announcements'");
    expect(allowlist).toContain("'push_daily_brief'");
    expect(allowlist).not.toContain("debate");
  });

  it("drops every Debate table", () => {
    for (const table of [
      "debates",
      "debate_arguments",
      "debate_votes",
      "debate_participants",
      "debate_motion_votes",
      "debate_memberships",
      "debate_rounds",
      "debate_argument_sources",
      "debate_reactions",
      "debate_ballots",
      "debate_subscriptions",
      "debate_moderation_events",
      "debate_cross_exchanges",
      "debate_notification_events",
      "debate_slots_v1_5",
      "debate_argument_sources_v1",
      "debate_v1_5_reminders",
    ]) {
      expect(schema, table).toContain(
        `drop table if exists public.${table} cascade`
      );
    }
  });

  it("leaves the Campus program format alone", () => {
    // debate_night is an offline Campus event type sharing a word with this
    // subsystem and nothing else. Its CHECK constraints and historical rows
    // must not be touched. Checked against the statements only: the header
    // comment names it precisely to say it is being left alone.
    expect(executableSql).not.toContain("debate_night");
    expect(executableSql).not.toMatch(/alter table public\.campus/i);
  });

  it("never drops a table that belongs to another feature", () => {
    const dropped = [
      ...schema.matchAll(/drop table if exists public\.([a-z0-9_]+)/gi),
    ].map((match) => match[1]);

    expect(dropped.length).toBeGreaterThan(0);
    for (const table of dropped) {
      expect(table, table).toMatch(/^debate/);
    }
  });

  it("reloads PostgREST so the dropped objects leave the API schema cache", () => {
    expect(schema).toContain("notify pgrst, 'reload schema'");
  });

  it("carries the backup instructions it destroys data without", () => {
    expect(schema).toContain("DESTRUCTIVE");
    expect(schema).toContain("\\copy (select * from public.debates)");
    expect(schema).toContain(
      "\\copy (select * from public.debate_arguments)"
    );
  });
});
