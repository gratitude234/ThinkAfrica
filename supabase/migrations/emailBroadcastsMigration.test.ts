import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the broadcast migration.
 *
 * There is no local migration runner in this project, so nothing else catches
 * a preference key silently dropped from a rewritten DEFAULT, or a new key the
 * settings form can set but set_notification_preference() will refuse. Both
 * were real defects in the first draft of this file, and both are the kind
 * that only surface once a real account has already lost the setting.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function read(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

const broadcasts = read("20260902000001_email_broadcasts.sql");
const previousDefault = read("20260523000003_message_email_notifications.sql");
const previousAllowlist = read("20260802000001_comments_ui_restore.sql");

/** The keys named in the first jsonb literal a migration assigns as DEFAULT. */
function defaultPreferenceKeys(sql: string) {
  const match = sql.match(
    /ALTER COLUMN notification_prefs SET DEFAULT '(\{[\s\S]*?\})'::jsonb/i
  );
  if (!match) throw new Error("No notification_prefs DEFAULT found.");
  return Object.keys(JSON.parse(match[1]) as Record<string, unknown>);
}

/** The keys set_notification_preference() will accept. */
function allowlistKeys(sql: string) {
  const match = sql.match(/if p_key not in \(([\s\S]*?)\) then/i);
  if (!match) throw new Error("No preference allowlist found.");
  return Array.from(match[1].matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
}

describe("the notification_prefs default", () => {
  it("keeps every preference the previous default carried", () => {
    // Rewriting the literal is how a key gets dropped: the new default silently
    // stops applying to accounts created after this migration.
    const before = defaultPreferenceKeys(previousDefault);
    const after = defaultPreferenceKeys(broadcasts);

    for (const key of before) {
      expect(after).toContain(key);
    }
  });

  it("still carries email_messages, which an earlier draft dropped", () => {
    expect(defaultPreferenceKeys(broadcasts)).toContain("email_messages");
  });

  it("adds the announcement key and nothing else", () => {
    const before = new Set(defaultPreferenceKeys(previousDefault));
    const added = defaultPreferenceKeys(broadcasts).filter(
      (key) => !before.has(key)
    );

    expect(added).toEqual(["email_announcements"]);
  });

  it("defaults announcements to on for an account that never opted out", () => {
    // The merge puts the new key underneath whatever the row already has, so
    // an existing explicit false survives and an absent key becomes true.
    expect(broadcasts).toMatch(
      /'\{"email_announcements": true\}'::jsonb\s*\|\|\s*coalesce\(notification_prefs/
    );
  });
});

describe("the preference allowlist", () => {
  it("accepts the new key, so the settings switch can actually save it", () => {
    // The function raises for anything not listed, which makes a new key inert
    // and then throws in the reader's face when they touch the switch.
    expect(allowlistKeys(broadcasts)).toContain("email_announcements");
  });

  it("keeps every key the previous allowlist accepted", () => {
    const before = allowlistKeys(previousAllowlist);
    const after = allowlistKeys(broadcasts);

    for (const key of before) {
      expect(after).toContain(key);
    }
  });
});

describe("the segment model", () => {
  it("provisions rows for the five standing audiences only", () => {
    // "selected" is per broadcast, built at send time and recorded on the row.
    // Seeding it here made the preflight expect six segments the sync would
    // never create.
    expect(broadcasts).toMatch(
      /INSERT INTO public\.broadcast_segments \(audience_key\)\s*VALUES \('all'\), \('active'\), \('authors'\), \('verified'\), \('new'\)/
    );
    expect(broadcasts).not.toMatch(/VALUES[^;]*'selected'[^;]*;/);
  });

  it("constrains the audience_key column to those same five", () => {
    const check = broadcasts.match(
      /audience_key text PRIMARY KEY CHECK \(audience_key = ANY \(ARRAY\[([\s\S]*?)\]\)\)/
    );
    expect(check).not.toBeNull();
    expect(check?.[1]).not.toContain("selected");
  });

  it("says five in the deployment checklist, matching what the sync creates", () => {
    expect(broadcasts).toMatch(/Confirm broadcast_segments has five rows/);
  });
});

describe("delivery idempotency", () => {
  it("records every webhook event before touching a counter", () => {
    expect(broadcasts).toMatch(/CREATE TABLE IF NOT EXISTS public\.broadcast_delivery_events/);
  });

  it("makes a repeated event impossible to insert twice", () => {
    expect(broadcasts).toMatch(
      /UNIQUE \(resend_broadcast_id, email_id, event_type\)/
    );
  });

  it("returns early when the insert found an existing event", () => {
    expect(broadcasts).toMatch(/ON CONFLICT \(resend_broadcast_id, email_id, event_type\) DO NOTHING/);
  });

  it("counts at most one outcome per message", () => {
    // Delivered and later complained is one recipient who received it, not one
    // delivered plus one failed.
    expect(broadcasts).toMatch(/AND email_id = p_email_id\s*\n\s*AND counted/);
  });

  it("caps the totals at the audience that was actually addressed", () => {
    expect(broadcasts).toMatch(
      /delivered_count \+ failed_count \+ v_delivered \+ v_failed <= recipient_count/
    );
  });
});

describe("the send claim", () => {
  it("is one statement in the database, not a read then a write", () => {
    expect(broadcasts).toMatch(/CREATE OR REPLACE FUNCTION public\.claim_broadcast_for_send/);
  });

  it("refuses a row that has ever been dispatched", () => {
    expect(broadcasts).toMatch(/AND dispatch_started_at IS NULL/);
  });

  it("only ever claims from an editable status", () => {
    expect(broadcasts).toMatch(/AND status IN \('draft', 'failed'\)/);
  });
});

describe("opt-out reconciliation", () => {
  it("mirrors a provider unsubscribe in one direction only", () => {
    expect(broadcasts).toMatch(/CREATE OR REPLACE FUNCTION public\.mirror_broadcast_unsubscribe/);
    expect(broadcasts).toMatch(/array\['email_announcements'\],\s*\n\s*'false'::jsonb/);
  });

  it("lets the member undo it themselves, and only themselves", () => {
    // A trigger rather than a branch in the RPC, because the settings form has
    // two save paths and both have to clear the mirrored opt-out.
    expect(broadcasts).toMatch(/CREATE TRIGGER profiles_broadcast_resubscribe/);
    expect(broadcasts).toMatch(/AFTER UPDATE OF notification_prefs ON public\.profiles/);
  });

  it("blanks synced_at on a re-opt-in so the next sync pushes it to Resend", () => {
    // Without this the contact stays suppressed at Resend forever, however
    // many times they turn the switch back on here.
    expect(broadcasts).toMatch(
      /resubscribed_at = now\(\),\s*\n\s*synced_at = NULL/
    );
  });
});

describe("the nightly schedule", () => {
  const schedule = read("20260902000002_schedule_resend_segment_sync.sql");

  it("adds the job to the dispatch allowlist", () => {
    // dispatch_indegenius_cron raises for a job/path pair it does not know,
    // so scheduling alone would fail on every run.
    expect(schedule).toMatch(
      /when 'indegenius-resend-segment-sync' then '\/api\/cron\/resend-segment-sync'/
    );
  });

  it("actually schedules it", () => {
    expect(schedule).toMatch(/cron\.schedule\(\s*\n\s*'indegenius-resend-segment-sync'/);
  });

  it("adds it to the removal set, so a reinstall does not leave a duplicate", () => {
    expect(schedule).toMatch(
      /remove_indegenius_cron_jobs[\s\S]*'indegenius-resend-segment-sync'/
    );
  });

  it("adds it to the inspection set, so a silent failure is visible", () => {
    expect(schedule).toMatch(
      /inspect_indegenius_cron_jobs[\s\S]*\('indegenius-resend-segment-sync', '[^']+'\)/
    );
  });

  it("keeps every job the previous scheduler installed", () => {
    const previous = read("20260827110918_migrate_scheduler_to_supabase_cron.sql");
    const jobs = Array.from(
      previous.matchAll(/cron\.schedule\(\s*\n\s*'([a-z0-9-]+)'/g)
    ).map((match) => match[1]);

    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(schedule).toContain(`'${job}'`);
    }
  });
});
