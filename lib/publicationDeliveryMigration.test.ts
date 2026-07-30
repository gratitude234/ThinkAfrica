import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/pending/author_subscriptions_publication_delivery_v1.sql"),
  "utf8"
);

describe("author subscription SQL release candidate", () => {
  it("is isolated from the executable migration ledger", () => {
    expect(sql).toContain("RELEASE-GATED SQL CANDIDATE");
    expect(sql).toContain("no publication events for existing published posts");
  });

  it("enforces relationship invariants and narrow grants", () => {
    expect(sql).toContain("author_subscriptions_no_self_check");
    expect(sql).toContain("p_subscribed is true");
    expect(sql).toContain("Unsubscribe deliberately leaves Follow intact");
    expect(sql).toContain("grant execute on function public.set_author_relationship");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toContain("grant all on public.author_subscriptions to authenticated");
  });

  it("captures only the first transition to published", () => {
    expect(sql).toContain("old.status is distinct from 'published'");
    expect(sql).toContain("on conflict (post_id) do nothing");
    expect(sql).not.toMatch(/insert into public\.publication_events[\s\S]+select[\s\S]+from public\.posts/i);
  });

  it("deduplicates recipient channels and uses locked bounded claims", () => {
    expect(sql).toContain("unique (event_id, recipient_id, channel)");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("attempts < 5");
    expect(sql).toContain("renew_publication_event_lease");
    expect(sql).toContain("renew_publication_delivery_lease");
  });

  it("restates the full notification type list so new types survive future rewrites", () => {
    // The probed live list must be spelled out, not inherited from the database,
    // because the next migration to touch this constraint will be copied from a
    // file. Spot-check the oldest and newest deployed types.
    expect(sql).toContain("'like', 'comment', 'follow'");
    expect(sql).toContain("'debate_phase_advanced', 'debate_cancelled'");
    expect(sql).toContain(
      "'author_published', 'author_subscribed', 'topic_published'"
    );
  });

  it("reports whether a subscription row was actually created", () => {
    // create or replace cannot widen a function's return type.
    expect(sql).toContain(
      "drop function if exists public.set_author_relationship(uuid, boolean, boolean)"
    );
    expect(sql).toContain("subscription_created boolean");
    expect(sql).toContain("v_subscription_created := v_row_count > 0");
  });

  it("refuses to drop a notification type that drifted into the live database", () => {
    expect(sql).toContain("pg_get_constraintdef");
    expect(sql).toContain("stop and re-run the live probe");
    expect(sql).toContain("allows types this file would drop");
    expect(sql).toContain("<> all (v_types)");
  });
});
