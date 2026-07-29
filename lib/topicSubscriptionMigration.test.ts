import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/pending/topic_subscriptions_v1.sql"),
  "utf8"
);

describe("topic subscription SQL release candidate", () => {
  it("stays outside the migration ledger and requires the author base", () => {
    expect(sql).toContain("RELEASE-GATED SQL CANDIDATE");
    expect(sql).toContain("author_subscriptions_publication_delivery_v1.sql");
    expect(sql).toContain("creates no subscriptions from profiles.interests");
  });

  it("normalizes and indexes topic keys without changing publication status", () => {
    expect(sql).toContain("normalize_topic_key");
    expect(sql).toContain("add column if not exists topic_keys");
    expect(sql).toContain("posts_published_topic_keys_idx");
    expect(sql).toContain("before insert or update of tags");
    expect(sql).not.toMatch(/update public\.posts[\s\S]+set status/i);
  });

  it("uses subscriber-only RLS and a narrow mutation RPC", () => {
    expect(sql).toContain("primary key (subscriber_id, topic_key)");
    expect(sql).toContain("subscriber_id = auth.uid()");
    expect(sql).toContain("grant select on public.topic_subscriptions to authenticated");
    expect(sql).toContain("grant execute on function public.set_topic_subscription");
    expect(sql).not.toContain("grant all on public.topic_subscriptions to authenticated");
  });

  it("permits only active published topics and enforces the 80-character limit", () => {
    expect(sql).toContain("char_length(v_topic_key) > 80");
    expect(sql).toContain("where status = 'published'");
    expect(sql).toContain("topic_keys @> array[v_topic_key]");
  });

  it("extends delivery provenance and preserves the live notification constraint", () => {
    expect(sql).toContain("matched_topic_keys");
    expect(sql).toContain("publication_deliveries_has_match_check");
    expect(sql).toContain("topic_published");
    expect(sql).toContain("pg_get_constraintdef");
    expect(sql).toContain("stop and re-run the live probe");
  });
});
