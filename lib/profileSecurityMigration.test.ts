import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const expandMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260815000001_profile_security_hardening.sql"
  ),
  "utf8"
);
const selectContract = readFileSync(
  resolve(process.cwd(), "supabase/pending/profile_private_projection_contract.sql"),
  "utf8"
);

const ownerReadCallsites = [
  "app/(main)/settings/page.tsx",
  "app/(main)/notifications/page.tsx",
  "app/(main)/subscriptions/page.tsx",
  "components/ui/NotificationBell.tsx",
  "app/(main)/page.tsx",
  "app/(onboarding)/onboarding/page.tsx",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8"));

describe("Phase 0 profile-security migration", () => {
  it("removes broad direct writes and grants only reviewed edit columns", () => {
    expect(expandMigration).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles"
    );
    expect(expandMigration).toContain(
      'DROP POLICY IF EXISTS "Users can insert their own profile"'
    );
    expect(expandMigration).toContain("WITH CHECK (auth.uid() = id)");
    expect(expandMigration).toContain("GRANT UPDATE (");
    expect(expandMigration).not.toMatch(/GRANT UPDATE \([\s\S]*?\bpoints\b[\s\S]*?\) ON TABLE/);
  });

  it("uses a default-deny trigger without blocking trusted definer flows", () => {
    expect(expandMigration).toContain("to_jsonb(NEW) - v_directly_editable_columns");
    expect(expandMigration).toContain(
      "auth.role() = 'authenticated' AND current_user = 'authenticated'"
    );
    for (const protectedColumn of [
      "points",
      "suspended_at",
      "suspended_reason",
      "is_alumni",
      "signup_email",
    ]) {
      expect(expandMigration).not.toMatch(
        new RegExp(`v_directly_editable_columns[\\s\\S]{0,800}'${protectedColumn}'`)
      );
    }
  });

  it("provides owner-only private reads and server-enforced message safety", () => {
    expect(expandMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_my_profile_private()"
    );
    expect(expandMigration).toContain("p.id = auth.uid()");
    expect(expandMigration).toContain("p.onboarding_completed");
    expect(expandMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.can_send_message_in_conversation"
    );
    expect(expandMigration).toContain(
      "public.can_send_message_in_conversation(conversation_id)"
    );
    expect(expandMigration).toContain("recipient allow_messages governs new conversations");
  });

  it("keeps the private SELECT contract staged and denies private columns", () => {
    expect(selectContract).toContain("DO NOT APPLY AS AN EXECUTABLE MIGRATION YET");
    expect(selectContract).toContain(
      "REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated"
    );
    for (const privateColumn of [
      "signup_email",
      "notification_prefs",
      "privacy_settings",
      "onboarding_completed",
      "suspended_at",
      "suspended_reason",
    ]) {
      expect(selectContract).toMatch(
        new RegExp(`REVOKE SELECT \\([\\s\\S]*?\\b${privateColumn}\\b`)
      );
    }
  });

  it("moves every owner-facing private read to the RPC", () => {
    for (const source of ownerReadCallsites) {
      expect(source).toContain('rpc("get_my_profile_private")');
    }
  });
});
