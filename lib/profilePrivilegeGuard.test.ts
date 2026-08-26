import { describe, expect, it } from "vitest";
import {
  PROFILE_DIRECT_UPDATE_ALLOWED_COLUMNS,
  PROFILE_SYSTEM_OWNED_COLUMNS,
  applyProfileInsertPrivilegeDefaults,
  isProfilePrivilegeChangeBlocked,
  type ProfilePrivilegeFields,
} from "@/lib/profilePrivilegeGuard";

const profile: ProfilePrivilegeFields = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "reader",
  full_name: "Reader One",
  country: "Nigeria",
  university: "University of Lagos",
  field_of_study: "History",
  profile_type: "student",
  secondary_profile_types: [],
  organization_name: null,
  professional_title: null,
  organization_website: null,
  bio: "Ideas and history.",
  positioning_statement: "How colonial land records still shape rural disputes.",
  avatar_url: null,
  cover_image_url: null,
  interests: ["history"],
  graduation_year: 2028,
  open_to_mentoring: false,
  onboarding_completed: true,
  notification_prefs: { email_comments: true },
  privacy_settings: { profile_visibility: "public" },
  role: "student",
  verified: false,
  verified_type: null,
  points: 12,
  created_at: "2026-01-01T00:00:00.000Z",
  is_alumni: false,
  signup_email: "reader@example.edu",
  suspended_at: null,
  suspended_reason: null,
  last_engagement_push_notified_at: null,
  last_comment_email_notified_at: null,
  push_prompt_shown_at: null,
  push_prompt_last_shown_at: null,
  push_prompt_attempt_count: 0,
};

function changedValue(value: unknown) {
  if (value === null || value === undefined) return "changed";
  if (typeof value === "boolean") return !value;
  if (typeof value === "number") return value + 1;
  if (typeof value === "string") return `${value}-changed`;
  if (Array.isArray(value)) return [...value, "changed"];
  return { ...(value as Record<string, unknown>), changed: true };
}

describe("protect_profile_privileged_columns (ported from SQL)", () => {
  it.each(PROFILE_SYSTEM_OWNED_COLUMNS)(
    "blocks a direct authenticated change to system column %s",
    (column) => {
      expect(
        isProfilePrivilegeChangeBlocked(
          "authenticated",
          "authenticated",
          profile,
          { ...profile, [column]: changedValue(profile[column]) }
        )
      ).toBe(true);
    }
  );

  it.each(PROFILE_DIRECT_UPDATE_ALLOWED_COLUMNS)(
    "allows a direct authenticated change to editable column %s",
    (column) => {
      expect(
        isProfilePrivilegeChangeBlocked(
          "authenticated",
          "authenticated",
          profile,
          { ...profile, [column]: changedValue(profile[column]) }
        )
      ).toBe(false);
    }
  );

  it("keeps the known editable and system-owned contracts disjoint", () => {
    const editable = new Set<string>(PROFILE_DIRECT_UPDATE_ALLOWED_COLUMNS);
    expect(PROFILE_SYSTEM_OWNED_COLUMNS.filter((column) => editable.has(column))).toEqual([]);
  });

  it("protects a future column by default", () => {
    expect(
      isProfilePrivilegeChangeBlocked(
        "authenticated",
        "authenticated",
        { ...profile, onboarding_completed_at: null },
        { ...profile, onboarding_completed_at: "2026-08-15T12:00:00.000Z" }
      )
    ).toBe(true);
  });

  it("mirrors jsonb equality when object keys are reordered", () => {
    expect(
      isProfilePrivilegeChangeBlocked(
        "authenticated",
        "authenticated",
        { ...profile, future_system_metadata: { alpha: 1, beta: 2 } },
        { ...profile, future_system_metadata: { beta: 2, alpha: 1 } }
      )
    ).toBe(false);
  });

  it("allows a no-op round trip", () => {
    expect(
      isProfilePrivilegeChangeBlocked(
        "authenticated",
        "authenticated",
        profile,
        { ...profile }
      )
    ).toBe(false);
  });

  it("allows a SECURITY DEFINER point write under an authenticated JWT", () => {
    expect(
      isProfilePrivilegeChangeBlocked(
        "authenticated",
        "postgres",
        profile,
        { ...profile, points: 17 }
      )
    ).toBe(false);
  });

  it("allows service-role admin verification and moderation writes", () => {
    expect(
      isProfilePrivilegeChangeBlocked(
        "service_role",
        "service_role",
        profile,
        {
          ...profile,
          role: "editor",
          verified: true,
          verified_type: "faculty",
          suspended_at: "2026-08-15T12:00:00.000Z",
        }
      )
    ).toBe(false);
  });

  it("allows a direct SQL/migration connection with no JWT claim", () => {
    expect(
      isProfilePrivilegeChangeBlocked(
        null,
        "postgres",
        profile,
        { ...profile, is_alumni: true }
      )
    ).toBe(false);
  });
});

describe("legacy protect_profile_privileged_columns_on_insert defense", () => {
  const student: ProfilePrivilegeFields = {
    role: "student",
    verified: false,
    verified_type: null,
  };
  const admin: ProfilePrivilegeFields = {
    role: "admin",
    verified: true,
    verified_type: "faculty",
  };

  it("resets an authenticated client's attempted trust fields", () => {
    expect(applyProfileInsertPrivilegeDefaults("authenticated", admin)).toEqual(student);
  });

  it("does not affect handle_new_user university-email verification", () => {
    const autoVerifiedRow: ProfilePrivilegeFields = {
      role: "student",
      verified: true,
      verified_type: "student",
    };
    expect(applyProfileInsertPrivilegeDefaults(null, autoVerifiedRow)).toEqual(
      autoVerifiedRow
    );
  });

  it("allows service-role inserts", () => {
    expect(applyProfileInsertPrivilegeDefaults("service_role", admin)).toEqual(admin);
  });
});
