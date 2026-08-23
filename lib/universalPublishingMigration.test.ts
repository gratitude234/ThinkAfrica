import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("universal publishing migration", () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260823000001_universal_publishing.sql"),
    "utf8"
  );

  it("keeps published edits private until one atomic apply function", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.post_edit_drafts");
    expect(sql).toContain("reference_snapshot jsonb");
    expect(sql).not.toMatch(/^\s*references\s+jsonb/m);
    expect(sql).toContain("author_id = auth.uid()");
    expect(sql).toContain("FUNCTION public.apply_post_edit_draft");
    expect(sql).toContain("FOR UPDATE");
  });

  it("awards the same points to titled and untitled direct publications", () => {
    expect(sql).toContain("v_points := 10");
    expect(sql).toContain("new.in_response_to IS NOT NULL");
    expect(sql).toContain("v_points := 3");
  });
});
