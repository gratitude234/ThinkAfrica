import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getPositioningStatementError,
  getProfileIdentityLines,
  getProfileMetaDescription,
  normalizePositioningStatement,
  POSITIONING_STATEMENT_EXAMPLE,
  POSITIONING_STATEMENT_HELPER,
  POSITIONING_STATEMENT_LABEL,
  POSITIONING_STATEMENT_MAX_LENGTH,
} from "./profileIdentity";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260826000001_profile_positioning_statement.sql"
  ),
  "utf8"
);
const profileForm = readFileSync(
  resolve(process.cwd(), "app/(main)/settings/ProfileForm.tsx"),
  "utf8"
);
const pendingContract = readFileSync(
  resolve(process.cwd(), "supabase/pending/profile_private_projection_contract.sql"),
  "utf8"
);

const profile = {
  id: "profile-1",
  username: "ada",
  full_name: "Ada",
  country: "Nigeria",
  university: null,
  field_of_study: null,
  bio: "A short biography.",
  avatar_url: null,
  verified: false,
  verified_type: null,
  profile_type: "professional",
  professional_title: "Policy researcher",
  organization_name: "Civic Lab",
  positioning_statement: null as string | null,
};

describe("positioning statement normalization", () => {
  it("collapses whitespace and returns null for an empty value", () => {
    expect(normalizePositioningStatement("  How budgets   fail.  ")).toBe(
      "How budgets fail."
    );
    expect(normalizePositioningStatement("First.\n\nSecond.")).toBe(
      "First. Second."
    );
    expect(normalizePositioningStatement("   ")).toBeNull();
    expect(normalizePositioningStatement("")).toBeNull();
    expect(normalizePositioningStatement(null)).toBeNull();
    expect(normalizePositioningStatement(undefined)).toBeNull();
  });

  it("preserves punctuation and non-Latin text", () => {
    expect(normalizePositioningStatement("Ìbàdàn's markets: who sets a price?")).toBe(
      "Ìbàdàn's markets: who sets a price?"
    );
  });
});

describe("positioning statement validation", () => {
  it("accepts an empty value, because the field is optional", () => {
    expect(getPositioningStatementError("")).toBeNull();
    expect(getPositioningStatementError("   ")).toBeNull();
    expect(getPositioningStatementError(null)).toBeNull();
  });

  it("accepts exactly the maximum length", () => {
    expect(
      getPositioningStatementError("a".repeat(POSITIONING_STATEMENT_MAX_LENGTH))
    ).toBeNull();
  });

  it("rejects one character past the maximum", () => {
    const error = getPositioningStatementError(
      "a".repeat(POSITIONING_STATEMENT_MAX_LENGTH + 1)
    );
    expect(error).toContain(String(POSITIONING_STATEMENT_MAX_LENGTH));
  });

  it("measures the normalized value, so padding alone is not an overflow", () => {
    expect(
      getPositioningStatementError(
        `   ${"a".repeat(POSITIONING_STATEMENT_MAX_LENGTH)}   `
      )
    ).toBeNull();
  });
});

describe("positioning statement rendering contract", () => {
  it("comes back from the identity lines beside the headline", () => {
    expect(
      getProfileIdentityLines({
        ...profile,
        positioning_statement: "  How budgets fail.  ",
      })
    ).toEqual({
      headline: "Policy researcher",
      affiliation: "Civic Lab · Nigeria",
      positioning: "How budgets fail.",
    });
  });

  it("does not become the headline, which is still the role", () => {
    const lines = getProfileIdentityLines({
      ...profile,
      professional_title: null,
      positioning_statement: "How budgets fail.",
    });
    expect(lines.headline).toBe("Writer on Indegenius");
    expect(lines.positioning).toBe("How budgets fail.");
  });
});

describe("profile metadata description", () => {
  it("prefers the positioning statement when the author wrote one", () => {
    expect(
      getProfileMetaDescription(
        { ...profile, positioning_statement: "How budgets fail." },
        "Ada"
      )
    ).toBe("How budgets fail.");
  });

  it("falls back to the bio, then to the derived identity line", () => {
    expect(getProfileMetaDescription(profile, "Ada")).toBe("A short biography.");
    expect(
      getProfileMetaDescription({ ...profile, bio: null }, "Ada")
    ).toBe(
      "Policy researcher at Civic Lab · Nigeria. View Ada's Intellectual Record on Indegenius."
    );
  });
});

describe("positioning statement storage contract", () => {
  it("adds a nullable text column with the same maximum the UI enforces", () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS positioning_statement text"
    );
    expect(migration).toContain(
      `char_length(positioning_statement) <= ${POSITIONING_STATEMENT_MAX_LENGTH}`
    );
    expect(migration).toContain("positioning_statement IS NULL");
    expect(migration).toContain("btrim(positioning_statement) <> ''");
  });

  it("follows the profile privilege-hardening pattern rather than reopening it", () => {
    expect(migration).toContain(
      "GRANT UPDATE (positioning_statement) ON TABLE public.profiles TO authenticated;"
    );
    expect(migration).toContain(
      "auth.role() = 'authenticated' AND current_user = 'authenticated'"
    );
    expect(migration).toContain("'positioning_statement',");
    expect(migration).not.toMatch(/GRANT UPDATE ON TABLE public\.profiles/);
    // The allowlist is added to, never widened to include a system column.
    for (const protectedColumn of ["points", "suspended_at", "is_alumni", "role"]) {
      expect(migration).not.toMatch(
        new RegExp(`v_directly_editable_columns[\\s\\S]{0,900}'${protectedColumn}'`)
      );
    }
  });

  it("exposes it publicly without exposing private onboarding fields", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.profile_directory");
    // Assert against the view body alone. notification_prefs and
    // privacy_settings legitimately appear in the direct-edit allowlist above
    // it; what matters is that they are not projected to readers.
    const view = migration.slice(
      migration.indexOf("CREATE OR REPLACE VIEW public.profile_directory"),
      migration.indexOf("REVOKE ALL ON TABLE public.profile_directory")
    );
    // Appended, not inserted: CREATE OR REPLACE VIEW can only add columns at
    // the end, and a mid-list insert fails with 42P16 by reading the shift as
    // a column rename.
    expect(view).toMatch(/p\.created_at,\s*\n\s*p\.positioning_statement\s*\nFROM/);
    for (const privateColumn of [
      "work_category",
      "current_path",
      "signup_email",
      "notification_prefs",
      "privacy_settings ->",
      "onboarding_completed",
      "suspended_reason",
    ]) {
      expect(view).not.toContain(privateColumn);
    }
  });

  it("stays selectable when the staged private-column contract is promoted", () => {
    expect(pendingContract).toMatch(
      /GRANT SELECT \([\s\S]*?positioning_statement[\s\S]*?\) ON TABLE public\.profiles/
    );
  });
});

describe("positioning statement editing contract", () => {
  it("is labelled and explained the way the product asks for", () => {
    expect(POSITIONING_STATEMENT_LABEL).toBe("Intellectual focus");
    expect(POSITIONING_STATEMENT_HELPER).toBe(
      "Describe the subjects, problems, or questions you are trying to understand."
    );
    expect(POSITIONING_STATEMENT_EXAMPLE.length).toBeGreaterThan(30);
    expect(POSITIONING_STATEMENT_EXAMPLE.length).toBeLessThanOrEqual(
      POSITIONING_STATEMENT_MAX_LENGTH
    );
  });

  it("is saved through the existing profile update, with a counter and validation", () => {
    // Whitespace-insensitive: the assertion is about what the save writes,
    // not about how the formatter wrapped it.
    expect(profileForm.replace(/\s+/g, " ")).toContain(
      "positioning_statement: normalizePositioningStatement(positioningStatement)"
    );
    expect(profileForm).toContain('id="positioning_statement"');
    expect(profileForm).toContain('htmlFor="positioning_statement"');
    expect(profileForm).toContain("aria-describedby=\"positioning_statement_help\"");
    expect(profileForm).toContain("aria-invalid={positioningError ? true : undefined}");
    expect(profileForm).toContain("{positioningStatement.length}/{POSITIONING_STATEMENT_MAX_LENGTH}");
    expect(profileForm).toContain('role="alert"');
    expect(profileForm).toContain("disabled={!!usernameError || !!positioningError}");
  });

  it("is hidden and unwritten until the migration is applied", () => {
    // PostgREST rejects a select naming a column that does not exist, and the
    // profile page reads that rejection as a missing profile. Deploying this
    // ahead of the migration without the gate would 404 every public profile.
    expect(profileForm).toContain("positioningEnabled = false");
    expect(profileForm.replace(/\s+/g, " ")).toContain(
      "...(positioningEnabled ? { positioning_statement:"
    );
    expect(profileForm).toContain("{positioningEnabled ? (");

    const flags = readFileSync(resolve(process.cwd(), "lib/featureFlags.ts"), "utf8");
    expect(flags).toContain(
      'process.env.NEXT_PUBLIC_PROFILE_POSITIONING_ENABLED === "1"'
    );
    for (const page of [
      "app/(main)/[username]/page.tsx",
      "app/(main)/[username]/record/page.tsx",
      "app/(main)/settings/page.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), page), "utf8");
      expect(source).toContain("isProfilePositioningEnabled()");
      // The column is never named in an unconditional projection.
      expect(source).not.toMatch(
        /const [A-Z_]*SELECT\s*=\s*\n?\s*"[^"]*positioning_statement[^"]*";/
      );
    }
  });

  it("does not hard-truncate a paste with maxLength", () => {
    const field = profileForm.slice(
      profileForm.indexOf('id="positioning_statement"'),
      profileForm.indexOf("positioning_statement_help")
    );
    expect(field).not.toContain("maxLength");
  });
});
