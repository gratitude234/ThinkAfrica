import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the migration that stops the gamification and publication
 * capture triggers.
 *
 * There is no local migration runner, so a mistake here surfaces in production
 * or not at all. The lists below are production's catalogue as read on
 * 2026-09-15: every trigger that awarded points or badges or captured a
 * publication for delivery, and every other trigger on the same four tables,
 * which must survive.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FILE = "20260915000004_stop_gamification_and_publication_capture_triggers.sql";
const PREVIOUS = "20260915000003_remove_publication_recovery_cron_job.sql";

const migration = readFileSync(join(MIGRATIONS, FILE), "utf8").replace(/\r\n/g, "\n");

/** Statements only, for assertions about what runs rather than what is explained. */
const executableSql = migration
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

/** [table, trigger, function] */
const RETIRED_TRIGGERS: Array<[string, string, string]> = [
  ["likes", "on_like_points", "award_points_on_like"],
  ["likes", "on_like_delete_points", "reverse_points_on_unlike"],
  ["posts", "on_post_published_points", "award_points_on_publish"],
  ["posts", "on_post_published_badges", "check_and_award_badges"],
  ["profiles", "on_points_updated", "check_points_badges"],
  ["post_reviews", "on_review_submitted_points", "award_points_on_review_submission"],
  ["posts", "posts_capture_first_publication_event", "capture_first_publication_event"],
];

/** Every other trigger production has on those four tables. */
const KEPT_TRIGGERS = [
  "on_like_insert_count",
  "on_like_delete_count",
  "guard_post_review_submission",
  "guard_locked_post_write",
  "on_post_approved",
  "posts_seed_aggregate_counts",
  "posts_sync_content_classification",
  "posts_sync_topic_keys",
  "posts_touch_updated_at",
  "posts_word_count_trg",
  "profiles_assign_selected_campus_cohort",
  "profiles_broadcast_resubscribe",
  "profiles_guard_onboarding_measurement_fields",
  "profiles_protect_privileged_columns",
  "profiles_protect_privileged_columns_on_insert",
];

describe("stopping the gamification and publication capture triggers", () => {
  it("follows the publication recovery cron removal in migration order", () => {
    expect(FILE > PREVIOUS).toBe(true);
  });

  it("drops every retired trigger, on its own table, idempotently", () => {
    for (const [table, trigger] of RETIRED_TRIGGERS) {
      expect(executableSql, trigger).toContain(`drop trigger if exists ${trigger} on public.${table};`);
    }
  });

  it("drops those seven triggers and no other", () => {
    const dropped = [...executableSql.matchAll(/drop trigger if exists (\w+) on public\.(\w+);/g)].map(
      (match) => `${match[2]}.${match[1]}`
    );
    expect(dropped.sort()).toEqual(RETIRED_TRIGGERS.map(([table, trigger]) => `${table}.${trigger}`).sort());
    expect([...executableSql.matchAll(/\bdrop\s+trigger\b/gi)]).toHaveLength(RETIRED_TRIGGERS.length);
    for (const kept of KEPT_TRIGGERS) {
      expect(executableSql, kept).not.toContain(kept);
    }
  });

  it("checks each trigger runs the function it expects, before dropping anything", () => {
    const guard = executableSql.slice(0, executableSql.indexOf("drop trigger"));
    for (const [table, trigger, fn] of RETIRED_TRIGGERS) {
      expect(guard, trigger).toContain(`('${table}', '${trigger}', '${fn}')`);
    }
    expect(guard).toMatch(/where p\.proname <> expected\.function_name/);
    expect(guard).toMatch(/raise exception/);
  });

  it("refuses to finish while any trigger still runs one of the seven functions", () => {
    const lastDrop = executableSql.lastIndexOf("drop trigger");
    const guard = executableSql.slice(lastDrop);
    for (const [, , fn] of RETIRED_TRIGGERS) {
      expect(guard, fn).toContain(`'${fn}'`);
    }
    expect(guard).toMatch(/not t\.tgisinternal/);
    expect(guard).toMatch(/raise exception/);
    expect(guard.indexOf("raise exception")).toBeLessThan(guard.indexOf("commit;"));
  });

  it("is one transaction", () => {
    expect(executableSql.trim().startsWith("begin;")).toBe(true);
    expect(executableSql.trim().endsWith("commit;")).toBe(true);
  });

  it("keeps every function, table, column and row", () => {
    expect(executableSql).not.toMatch(/\bdrop\s+(table|function|schema|view|column|policy|index|type)\b/i);
    expect(executableSql).not.toMatch(/\balter\s+(table|function)\b/i);
    expect(executableSql).not.toMatch(/\bcreate\s+(or\s+replace\s+)?(function|trigger|table)\b/i);
    expect(executableSql).not.toMatch(/\b(insert\s+into|delete\s+from|truncate)\b/i);
    expect(executableSql).not.toMatch(/\bupdate\s+(public\.)?\w+\s+set\b/i);
  });

  it("rewrites no point total, badge or profile", () => {
    expect(executableSql).not.toMatch(/\bpoints\s*=/i);
    expect(executableSql).not.toMatch(/\b(user_badges|badges)\b/i);
    expect(executableSql).not.toMatch(/\bpublic\.profiles\s+set\b/i);
    expect(executableSql).not.toMatch(/publication_(events|deliveries)/i);
  });

  it("does not touch the scheduler", () => {
    expect(executableSql).not.toMatch(/\bcron\./i);
    expect(executableSql).not.toMatch(/indegenius_cron/i);
  });
});
