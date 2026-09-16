import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824000001_identity_first_onboarding.sql"
  ),
  "utf8"
);
// The application stopped calling these functions in the publishing reset,
// Phase 2G, when onboarding became a profile step and an optional topics step.
// They stay in the database until the cleanup phase, so the migration's own
// guarantees are still asserted here. lib/simpleWriterProfile.test.ts asserts
// that nothing calls them.

describe("identity-first onboarding migration", () => {
  it("keeps work categories owner-only and outside the public profile projection", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.user_onboarding_preferences");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("USING ((SELECT auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((SELECT auth.uid()) = user_id)");
    expect(migration).toContain("REVOKE ALL ON TABLE public.user_onboarding_preferences");
    expect(migration).not.toContain("CREATE OR REPLACE VIEW public.profile_directory");
  });

  it("restricts every definer operation and validates the two identity branches", () => {
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_my_onboarding_state()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.save_onboarding_identity(");
    expect(migration).toContain("FUNCTION public.save_onboarding_preferences(text, text)");
    expect(migration).toContain("p_current_path = 'student'");
    expect(migration).toContain("v_user_id, 'non_student', p_work_category");
    expect(migration).toContain("COALESCE(cardinality(v_interests), 0) NOT BETWEEN 3 AND 5");
  });
});
