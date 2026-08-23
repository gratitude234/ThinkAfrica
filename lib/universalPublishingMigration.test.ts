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

  it("keeps reference row ids across an applied edit, because citations anchor to them", () => {
    // A blanket "DELETE ... WHERE post_id = ..." would re-mint every id and
    // break every #ref-id- anchor in the body.
    expect(sql).not.toMatch(/DELETE FROM public\.post_references\s+WHERE post_id = post_row\.id;/);
    expect(sql).toMatch(/DELETE FROM public\.post_references ref[\s\S]*?NOT EXISTS/);
    expect(sql).toContain("UPDATE public.post_references");
    expect(sql).toContain("IF FOUND THEN");
  });

  it("awards the same points to titled and untitled direct publications", () => {
    expect(sql).toContain("v_points := 10");
    expect(sql).toContain("new.in_response_to IS NOT NULL");
    expect(sql).toContain("v_points := 3");
  });
});
