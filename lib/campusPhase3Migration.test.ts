import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260816000001_phase3_campus_density.sql"
  ),
  "utf8"
);

describe("Phase 3 campus-density migration", () => {
  it("creates explicit cohort, prompt, program, submission, and activity facts", () => {
    for (const table of [
      "campus_cohorts",
      "campus_cohort_memberships",
      "campus_editorial_prompts",
      "campus_programs",
      "campus_prompt_submissions",
      "campus_ambassador_activity",
    ]) {
      expect(migration).toMatch(
        new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i")
      );
    }
  });

  it("snapshots membership so cohort denominators do not drift with profile edits", () => {
    expect(migration).toMatch(/user_id uuid NOT NULL UNIQUE REFERENCES public\.profiles/i);
    expect(migration).toMatch(/profiles_assign_selected_campus_cohort/i);
    expect(migration).toMatch(/campus_cohort_backfill_memberships/i);
    expect(migration).toMatch(/FROM public\.campus_cohort_memberships AS membership/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.assign_profile_to_selected_campus_cohort\(\) FROM PUBLIC/i
    );
  });

  it("restricts new Ambassador applications to selected campuses", () => {
    expect(migration).toMatch(/Authenticated users can apply at selected campuses/i);
    expect(migration).toMatch(/campus_cohort_id IS NOT NULL/i);
    expect(migration).toMatch(/cohort\.status IN \('selected', 'active'\)/i);
  });

  it("allows assigned active Ambassadors to use their cohort prompts", () => {
    expect(migration).toMatch(/ambassador\.campus_cohort_id = prompt\.cohort_id/i);
    expect(migration).toMatch(/ambassador\.status = 'active'/i);
  });

  it("keeps cohort analytics service-role-only", () => {
    expect(migration).toMatch(/FUNCTION public\.get_campus_candidates\(\)/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_campus_candidates\(\) FROM anon, authenticated/i
    );
    expect(migration).toMatch(/FUNCTION public\.get_campus_cohort_metrics\(\)/i);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_campus_cohort_metrics\(\) FROM anon, authenticated/i
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_campus_cohort_metrics\(\) TO service_role/i
    );
  });

  it("defines durable second-publication and response windows", () => {
    expect(migration).toMatch(/publication_number = 2/i);
    expect(migration).toMatch(/interval '30 days'/i);
    expect(migration).toMatch(/response_post\.author_id <> milestone\.user_id/i);
  });
});
