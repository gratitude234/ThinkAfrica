import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contract checks on the two migrations this production pass adds.
 *
 * There is no local migration runner, so the properties these files are
 * responsible for are asserted by reading them. Each one below corresponds to
 * something that actually went wrong against the live account.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function read(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

const dedupe = read("20260906000001_broadcast_campaign_dedupe.sql");
const outcomes = read("20260906000002_broadcast_delivery_outcomes.sql");

describe("the duplicate-campaign claim", () => {
  it("takes a lock before it looks, so two racing claims serialise", () => {
    // A select-then-send written in the application cannot do this: both tabs
    // read "no duplicate" before either writes. The lock is what makes the
    // check and the claim one decision.
    expect(dedupe).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_fingerprint, 0\)\)/);
    const lockAt = dedupe.indexOf("pg_advisory_xact_lock");
    const checkAt = dedupe.indexOf("WHERE campaign_fingerprint = p_fingerprint");
    const claimAt = dedupe.indexOf("SET status = 'queued'");
    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(checkAt);
    expect(checkAt).toBeLessThan(claimAt);
  });

  it("treats a claimed row as irreversible, so the loser of a race is refused", () => {
    expect(dedupe).toMatch(
      /status IN \('queued', 'sending', 'sent'\) OR dispatch_started_at IS NOT NULL/
    );
  });

  it("keeps every per-row guard the old claim had", () => {
    // An override skips the duplicate question and nothing else, so it can
    // never send one broadcast twice.
    expect(dedupe).toMatch(/AND status IN \('draft', 'failed'\)/);
    expect(dedupe).toMatch(/AND dispatch_started_at IS NULL/);
  });

  it("bounds the block to a window rather than forever", () => {
    expect(dedupe).toMatch(/make_interval\(hours => greatest\(coalesce\(p_window_hours, 24\), 0\)\)/);
    expect(dedupe).toMatch(
      /coalesce\(sent_at, dispatch_started_at, send_claimed_at, updated_at\) >= v_cutoff/
    );
  });
});

describe("superseding stale drafts", () => {
  it("adds a status rather than a flag beside one", () => {
    // Every guard that already reasons about status then covers it for free.
    expect(dedupe).toMatch(
      /'draft', 'queued', 'sending', 'sent', 'failed', 'superseded'/
    );
  });

  it("never deletes anything and never touches a sent record", () => {
    expect(dedupe).not.toMatch(/DELETE FROM/i);
    expect(dedupe).toMatch(/AND status IN \('draft', 'failed'\)\s*\n\s*AND dispatch_started_at IS NULL/);
  });

  it("records which broadcast did the superseding", () => {
    expect(dedupe).toMatch(/superseded_by uuid/);
    expect(dedupe).toMatch(/SET status = 'superseded',\s*\n\s*superseded_by = p_superseded_by/);
  });
});

describe("delivery outcomes", () => {
  it("gives suppression a bucket of its own", () => {
    expect(outcomes).toMatch(/ADD COLUMN IF NOT EXISTS suppressed_count integer/);
    expect(outcomes).toMatch(
      /suppressed_count = suppressed_count \+ \(CASE WHEN p_outcome = 'suppressed' THEN 1 ELSE 0 END\)/
    );
  });

  it("still lets one message into only one bucket", () => {
    // The event row is written first, and at most one event per email_id ever
    // counts, so a message delivered and later complained about is one
    // recipient rather than two.
    expect(outcomes).toMatch(/ON CONFLICT \(resend_broadcast_id, email_id, event_type\) DO NOTHING/);
    expect(outcomes).toMatch(/IF v_already_counted THEN\s*\n\s*RETURN false;/);
  });

  it("stops deciding completion from arithmetic", () => {
    // delivered + failed >= recipient_count is what left two finished
    // campaigns saying "Sending": 24 suppressed messages are never delivered
    // and never fail, so the sum could not arrive.
    const outcomeFn = outcomes.slice(
      outcomes.indexOf("FUNCTION public.record_broadcast_delivery_outcome"),
      outcomes.indexOf("FUNCTION public.record_broadcast_delivery_event")
    );
    expect(outcomeFn).not.toMatch(/SET status = 'sent'/);
  });

  it("keeps the old entry point working through a rollout", () => {
    expect(outcomes).toMatch(
      /FUNCTION public\.record_broadcast_delivery_event\([\s\S]*?SELECT public\.record_broadcast_delivery_outcome/
    );
    expect(outcomes).not.toMatch(/DROP FUNCTION[\s\S]*record_broadcast_delivery_event/);
  });
});

describe("the provider deciding a campaign is over", () => {
  it("only finalises the row whose provider status was read", () => {
    expect(outcomes).toMatch(/AND resend_broadcast_id = p_resend_broadcast_id/);
    expect(outcomes).toMatch(/AND dispatch_started_at IS NOT NULL/);
  });

  it("cannot touch a row that was never dispatched", () => {
    const finaliser = outcomes.slice(
      outcomes.indexOf("FUNCTION public.mark_broadcast_provider_sent")
    );
    expect(finaliser).toMatch(/AND status IN \('queued', 'sending', 'failed'\)/);
  });
});

describe("suppression as deliverability", () => {
  it("never writes to notification preferences", () => {
    const suppression = outcomes.slice(
      outcomes.indexOf("FUNCTION public.record_broadcast_suppression"),
      outcomes.indexOf("FUNCTION public.clear_broadcast_suppression")
    );
    expect(suppression).not.toMatch(/notification_prefs/);
    expect(suppression).not.toMatch(/email_announcements/);
    expect(suppression).not.toMatch(/unsubscribed/);
  });

  it("stores the address it applies to, so a move clears it by itself", () => {
    expect(outcomes).toMatch(/ADD COLUMN IF NOT EXISTS suppressed_email text/);
    expect(outcomes).toMatch(/suppressed_email = v_email/);
  });

  it("re-queues the contact so the next sync removes them from the segments", () => {
    expect(outcomes).toMatch(/synced_at = NULL/);
  });

  it("offers an explicit clear rather than an invented provider API", () => {
    // resend@6.12.3 exposes no suppression-list resource at all, so there is
    // nothing to poll and nothing to delete remotely.
    expect(outcomes).toMatch(/FUNCTION public\.clear_broadcast_suppression/);
  });
});

describe("repairing the first production broadcast", () => {
  const backfill = outcomes.slice(outcomes.indexOf("UPDATE public.broadcasts AS b"));

  it("derives every number from events that actually arrived", () => {
    expect(backfill).toMatch(/FROM public\.broadcast_delivery_events/);
    expect(backfill).toMatch(/WHERE counted/);
    expect(backfill).toMatch(/event_type = 'email\.suppressed'/);
    expect(backfill).toMatch(
      /event_type IN \('email\.bounced', 'email\.complained', 'email\.failed'\)/
    );
  });

  it("derives rather than adjusts, so running it twice changes nothing", () => {
    expect(backfill).toMatch(/SET delivered_count = totals\.delivered/);
    expect(backfill).not.toMatch(/delivered_count = delivered_count [+-]/);
    expect(backfill).toMatch(/IS DISTINCT FROM/);
  });

  it("invents no recipient outcome that is not on record", () => {
    // Nothing derives a count from recipient_count, so a recipient with no
    // terminal event stays pending rather than being assumed delivered.
    expect(backfill).not.toMatch(/recipient_count/);
  });
});
