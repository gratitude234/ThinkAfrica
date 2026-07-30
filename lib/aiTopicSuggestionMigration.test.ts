import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/pending/ai_topic_suggestions_v1.sql"),
  "utf8"
);

describe("AI topic suggestion pending migration", () => {
  it("adds separated Research keywords without rewriting published content", () => {
    expect(sql).toContain("add column if not exists research_keywords text[]");
    expect(sql).not.toMatch(/update\s+public\.posts/i);
  });

  it("keeps quota rows private and profile-scoped", () => {
    expect(sql).toContain("references public.profiles(id) on delete cascade");
    expect(sql).toContain(
      "revoke all on public.ai_topic_suggestion_quotas from public, anon, authenticated"
    );
    expect(sql).not.toContain(
      "grant select on public.ai_topic_suggestion_quotas to authenticated"
    );
  });

  it("claims the 20-request UTC quota atomically with a narrow RPC grant", () => {
    expect(sql).toContain("claim_ai_topic_suggestion_quota()");
    expect(sql).toContain("on conflict (user_id, quota_date) do update");
    expect(sql).toContain("request_count < 20");
    expect(sql).toContain("20 - v_count");
    expect(sql).toContain("at time zone 'UTC'");
    expect(sql).toContain(
      "grant execute on function public.claim_ai_topic_suggestion_quota()"
    );
  });

  it("does not store draft prompts, responses, or fingerprints", () => {
    expect(sql).not.toMatch(/\b(prompt|response_body|fingerprint)\b/i);
  });
});
