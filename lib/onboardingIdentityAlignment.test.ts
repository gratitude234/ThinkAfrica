import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INTEREST_OPTIONS } from "@/lib/interests";

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

    // The onboarding topics step no longer calls save_onboarding_topics, but the
    // curated list is still the one that function was written against. A drift
    // here would mean the two lists stopped describing the same topics.
    expect(sqlTopics).toEqual(INTEREST_OPTIONS.map((option) => option.label));
  });
});

describe("identity alignment migration", () => {
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
    expect(onboardingClient).toContain("resolveOnboardingStep(initialRequestedStep");
    expect(onboardingClient).toContain("}, [router]);");
    expect(onboardingClient).not.toContain("}, [requestedStep, router]);");
  });
});
