import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261002000100_profile_v3_selected_work.sql"),
  "utf8"
);

describe("Profile V3 selected work migration", () => {
  it("creates a single-work owner RPC without security definer", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.set_my_selected_work");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(sql).toMatch(/post\.author_id = v_user_id/);
    expect(sql).toMatch(/post\.status = 'published'/);
    expect(sql).toMatch(/post\.content_kind IN \('post', 'article'\)/);
    expect(sql).toMatch(/DELETE FROM public\.profile_featured_posts/);
    expect(sql).toMatch(/VALUES \(v_user_id, p_post_id, 1\)/);
  });

  it("exposes reads through RLS and grants only authenticated callers mutation privileges", () => {
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.profile_featured_posts TO anon, authenticated/);
    expect(sql).toMatch(/GRANT INSERT, DELETE ON TABLE public\.profile_featured_posts TO authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_my_selected_work\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_my_selected_work\(uuid\)[\s\S]*TO authenticated/);
  });
});
