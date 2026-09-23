import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260923000001_feed_v4_stability.sql"),
  "utf8"
);

describe("feed v4 stability migration", () => {
  it("installs bounded ranking and rendered-card hydration RPCs", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_feed_ranking_metrics\(p_post_ids uuid\[\]\)/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.hydrate_feed_cards\(p_post_ids uuid\[\]\)/i);
    expect(sql).toMatch(/SECURITY INVOKER|LANGUAGE sql[\s\S]+SET search_path/i);
  });

  it("keeps viewer-context access bound to the current user", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_feed_viewer_context/i);
    expect(sql).toMatch(/SECURITY DEFINER/i);
    expect(sql).toMatch(/auth\.uid\(\) IS DISTINCT FROM p_user_id/i);
    expect(sql).toMatch(/ERRCODE = '42501'/i);
  });
});
