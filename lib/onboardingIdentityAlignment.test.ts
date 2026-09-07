import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INTEREST_OPTIONS } from "@/lib/interests";
import {
  CATEGORY_PRIMARY_PROFILE_TYPE,
  WORK_CATEGORY_OPTIONS,
} from "@/lib/onboarding";

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const baseMigration = readRepoFile(
  "supabase/migrations/20260824000001_identity_first_onboarding.sql"
);
const alignmentMigration = readRepoFile(
  "supabase/migrations/20260824000003_onboarding_identity_alignment.sql"
);
const onboardingClient = readRepoFile(
  "app/(onboarding)/onboarding/OnboardingClient.tsx"
);
const profileSettings = readRepoFile("app/(main)/settings/ProfileForm.tsx");
const profileActions = readRepoFile("app/(main)/settings/profileActions.ts");

describe("onboarding topic allowlist", () => {
  it("matches the topics the client offers", () => {
    const allowlist = baseMigration.match(
      /v_allowed CONSTANT text\[\] := ARRAY\[([\s\S]*?)\]::text\[\]/
    );
    expect(allowlist).not.toBeNull();

    const sqlTopics = allowlist![1]
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/^'|'$/g, ""));

    // save_onboarding_topics rejects anything outside its own hardcoded list, so
    // a topic added only in TypeScript would fail step 3 at runtime.
    expect(sqlTopics).toEqual(INTEREST_OPTIONS.map((option) => option.label));
  });
});

describe("identity alignment migration", () => {
  it("writes the work category's own profile type instead of flattening it", () => {
    for (const category of WORK_CATEGORY_OPTIONS) {
      expect(alignmentMigration).toContain(
        `WHEN '${category.value}' THEN '${CATEGORY_PRIMARY_PROFILE_TYPE[category.value]}'`
      );
    }
    expect(alignmentMigration).toContain("SET profile_type = v_profile_type");
  });

  it("stops clearing fields the identity step never collects", () => {
    expect(baseMigration).toContain("organization_website = NULL");
    expect(alignmentMigration).not.toContain("organization_website = NULL");
    expect(alignmentMigration).not.toContain("secondary_profile_types = '{}'::text[]");
  });

  it("repairs the cohort the first cut flattened", () => {
    expect(alignmentMigration).toContain("UPDATE public.profiles AS profile");
    expect(alignmentMigration).toContain("AND profile.profile_type = 'professional'");
    expect(alignmentMigration).toContain("preference.current_path = 'non_student'");
  });

  it("keeps the replaced function locked down", () => {
    expect(alignmentMigration).toContain("SECURITY DEFINER");
    expect(alignmentMigration).toContain("SET search_path = ''");
    expect(alignmentMigration).toContain(
      "REVOKE ALL ON FUNCTION public.save_onboarding_identity("
    );
    expect(alignmentMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.save_onboarding_identity("
    );
  });
});

describe("onboarding client loader", () => {
  it("reads the requested step once so a step change cannot refetch the profile", () => {
    expect(onboardingClient).toContain("const requestedStepRef = useRef(requestedStep)");
    expect(onboardingClient).toContain("parseOnboardingStep(initialRequestedStep)");
    expect(onboardingClient).toContain("}, [router]);");
    expect(onboardingClient).not.toContain("}, [requestedStep, router]);");
  });
});

describe("settings preference sync", () => {
  it("only re-derives the work category when the profile type actually changes", () => {
    // The form still owns the question, because it is the only thing that
    // knows what the profile type was when the page loaded. It now answers it
    // as an input to the server action instead of by skipping an RPC itself.
    expect(profileSettings.replace(/\s+/g, " ")).toContain(
      "syncRecommendationPreference: profileType !== savedProfileTypeRef.current || !onboardingPreference?.currentPath"
    );
    expect(profileActions).toContain(
      "if (input.syncRecommendationPreference && nextPreference.currentPath)"
    );
    // Deliberately a hint and not an authorization input: the action says so,
    // and the worst a wrong value can do is skip or repeat an idempotent write
    // to the viewer's own row.
    expect(profileActions).toContain("A hint, not an authorization input");
  });

  it("splits school fields from work fields by onboarding path, not profile type", () => {
    // A non-student in the research or education category now carries
    // profile_type "researcher", so a type-based split would hide the headline
    // and organisation fields they filled in during onboarding.
    expect(profileSettings).toContain(
      "onboardingPreference.currentPath === \"student\""
    );
    expect(profileSettings).toContain("if (hasNonAcademicProfile) {");
    expect(profileSettings).not.toContain("Add your organization name.");
  });
});
