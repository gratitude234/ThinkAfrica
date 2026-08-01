import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/pending/author_subscriptions_ux_v2.sql"),
  "utf8"
).toLowerCase();

describe("author subscriptions UX V2 migration candidate", () => {
  it("is additive and retains V1 compatibility", () => {
    expect(sql).toContain("do not apply directly");
    expect(sql).toContain("set_author_relationship_v2");
    expect(sql).toContain(
      "create or replace function public.set_author_relationship("
    );
    expect(sql).not.toContain("drop function if exists public.set_author_relationship(");
  });

  it("stores private aggregate events without subscriber identity", () => {
    const table = sql.slice(
      sql.indexOf("create table if not exists public.author_subscription_events"),
      sql.indexOf("create index if not exists author_subscription_events_author_created_idx")
    );
    expect(table).not.toContain("subscriber_id");
    expect(sql).toContain(
      "revoke all on public.author_subscription_events from public, anon, authenticated"
    );
    expect(sql).not.toMatch(
      /insert\s+into\s+public\.author_subscription_events[^;]*\)\s*select\s+/
    );
  });

  it("validates sources, source posts, and preference keys", () => {
    expect(sql).toContain("invalid relationship source");
    expect(sql).toContain("the source publication does not credit this author");
    expect(sql).toContain("unsupported notification preference");
    expect(sql).toContain("jsonb_set");
  });

  it("provides caller-only manager and stable feed RPCs", () => {
    expect(sql).toContain("list_my_author_subscriptions");
    expect(sql).toContain("list_my_topic_subscriptions");
    expect(sql).toContain("get_subscription_feed_candidates");
    expect(sql).toContain("order by c.published_at desc, c.post_id desc");
  });
});
