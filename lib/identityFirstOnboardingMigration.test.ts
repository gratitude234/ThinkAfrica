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
const client = readFileSync(
  resolve(process.cwd(), "app/(onboarding)/onboarding/OnboardingClient.tsx"),
  "utf8"
);
const profileSettings = readFileSync(
  resolve(process.cwd(), "app/(main)/settings/ProfileForm.tsx"),
  "utf8"
);

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

  it("finishes through the existing atomic RPC without a follow or push step", () => {
    expect(client).toContain('createClient().rpc("complete_onboarding")');
    expect(client).toContain("Publish your first idea");
    expect(client).toContain("Explore ideas first");
    expect(client).not.toContain("NotificationPermissionPrompt");
    expect(client).not.toContain("FollowButton");
  });

  it("keeps recommendation preferences editable when profile roles change", () => {
    expect(profileSettings).toContain("deriveLegacyOnboardingPreference(profileType)");
    expect(profileSettings).toContain('"save_onboarding_preferences"');
  });
});
