import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260815000002_phase0_measurement_foundation.sql"
  ),
  "utf8"
);
const onboardingPage = readFileSync(
  resolve(process.cwd(), "app/(onboarding)/onboarding/OnboardingClient.tsx"),
  "utf8"
);
const mainLayout = readFileSync(
  resolve(process.cwd(), "app/(main)/layout.tsx"),
  "utf8"
);
const analyticsPage = readFileSync(
  resolve(process.cwd(), "app/(main)/admin/analytics/page.tsx"),
  "utf8"
);
const activationRoute = readFileSync(
  resolve(process.cwd(), "app/api/activation/route.ts"),
  "utf8"
);

describe("Phase 0 measurement foundation", () => {
  it("makes onboarding completion atomic, authenticated, and RPC-only", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS onboarding_completed_at");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.complete_onboarding()");
    expect(migration).toMatch(
      /complete_onboarding\(\)[\s\S]+SECURITY DEFINER[\s\S]+auth\.role\(\) IS DISTINCT FROM 'authenticated'/
    );
    expect(migration).toContain("current_user = 'authenticated'");
    expect(migration).toContain(
      "NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at"
    );
    expect(migration).toContain("coalesce(cardinality(v_interests), 0) < 1");
    expect(migration).toContain("v_profile_type IN ('student', 'researcher', 'educator')");
    expect(migration).toContain("'complete_onboarding_rpc'");
    expect(onboardingPage).toContain('createClient().rpc("complete_onboarding")');
    expect(onboardingPage).not.toContain(
      'trackActivationEvent({ event: "onboarding_completed" })'
    );
  });

  it("records one server-derived UTC activity fact per authenticated user/day", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.user_activity_days");
    expect(migration).toContain("PRIMARY KEY (user_id, activity_date)");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.record_user_activity_day()");
    expect(migration).toContain("ON CONFLICT (user_id, activity_date) DO NOTHING");
    expect(migration).toContain("(v_seen_at AT TIME ZONE 'UTC')::date");
    expect(mainLayout).toContain('supabase.rpc("record_user_activity_day")');
  });

  it("keeps the ordered baseline service-role-only and based on durable facts", () => {
    const baselineStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.get_phase0_measurement_baseline"
    );
    const baselineSql = migration.slice(baselineStart);

    expect(baselineStart).toBeGreaterThan(-1);
    expect(baselineSql).toContain("SECURITY DEFINER");
    expect(baselineSql).toContain("row_number() OVER");
    expect(baselineSql).toContain("second_publish_at <= first_publish_at + interval '30 days'");
    expect(baselineSql).toContain("response_post.author_id <> ordered_publications.user_id");
    expect(baselineSql).toContain("activity.activity_date = journey.signup_date_utc + 30");
    expect(baselineSql).toContain(
      "signup_date_utc + 30 > activity_window.collection_started_on"
    );
    expect(baselineSql).toContain("FROM anon, authenticated");
    expect(baselineSql).toContain("TO service_role");
    expect(analyticsPage).toContain('supabase.rpc("get_phase0_measurement_baseline", {');
  });

  it("removes anonymous activation-event insertion", () => {
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Anyone can insert activation events"'
    );
    expect(migration).toContain(
      'CREATE POLICY "Authenticated users can insert own activation events"'
    );
    expect(migration).toContain("auth.uid() = user_id");
    expect(activationRoute).toContain(
      'error: "Authentication required for this activation event."'
    );
    expect(activationRoute).toContain("{ status: 401 }");
  });
});
