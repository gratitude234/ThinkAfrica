/**
 * Pure port of the direct-update invariant enforced by
 * protect_profile_privileged_columns() in
 * supabase/migrations/20260815000001_profile_security_hardening.sql.
 *
 * PostgreSQL remains the authority. This module makes the allowlist and the
 * auth.role()/current_user trust distinction executable in Vitest because the
 * repository has no local PostgreSQL policy harness.
 */

export const PROFILE_DIRECT_UPDATE_ALLOWED_COLUMNS = [
  "username",
  "full_name",
  "country",
  "university",
  "field_of_study",
  "profile_type",
  "secondary_profile_types",
  "organization_name",
  "professional_title",
  "organization_website",
  "bio",
  "avatar_url",
  "cover_image_url",
  "interests",
  "graduation_year",
  "open_to_mentoring",
  "onboarding_completed",
  "notification_prefs",
  "privacy_settings",
] as const;

/**
 * Known system-owned columns at the time of the Phase 0 audit. The SQL guard
 * is stricter than this list: every present or future column not included in
 * PROFILE_DIRECT_UPDATE_ALLOWED_COLUMNS is protected by default.
 */
export const PROFILE_SYSTEM_OWNED_COLUMNS = [
  "id",
  "role",
  "verified",
  "verified_type",
  "points",
  "created_at",
  "is_alumni",
  "signup_email",
  "suspended_at",
  "suspended_reason",
  "last_engagement_push_notified_at",
  "last_comment_email_notified_at",
  "push_prompt_shown_at",
  "push_prompt_last_shown_at",
  "push_prompt_attempt_count",
] as const;

const directlyEditableColumns = new Set<string>(PROFILE_DIRECT_UPDATE_ALLOWED_COLUMNS);

export interface ProfilePrivilegeFields {
  role: string;
  verified: boolean;
  verified_type: string | null;
  [column: string]: unknown;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entry]) => [key, canonicalJsonValue(entry)])
    );
  }
  return value;
}

function jsonValueIsDistinct(left: unknown, right: unknown) {
  if (Object.is(left, right)) return false;
  return JSON.stringify(canonicalJsonValue(left)) !== JSON.stringify(canonicalJsonValue(right));
}

/**
 * Mirrors the SQL trigger's default-deny comparison.
 *
 * `requestRole` models auth.role(), which retains the original JWT role even
 * inside SECURITY DEFINER code. `currentUser` models PostgreSQL current_user:
 * it is `authenticated` for a direct PostgREST table update and switches to
 * the function owner inside a SECURITY DEFINER points/admin workflow.
 */
export function isProfilePrivilegeChangeBlocked(
  requestRole: string | null,
  currentUser: string | null,
  oldProfile: ProfilePrivilegeFields,
  newProfile: ProfilePrivilegeFields
): boolean {
  if (requestRole !== "authenticated" || currentUser !== "authenticated") {
    return false;
  }

  const columns = new Set([...Object.keys(oldProfile), ...Object.keys(newProfile)]);
  for (const column of columns) {
    if (directlyEditableColumns.has(column)) continue;
    if (jsonValueIsDistinct(oldProfile[column], newProfile[column])) return true;
  }

  return false;
}

export const PROFILE_PRIVILEGE_INSERT_DEFAULTS: ProfilePrivilegeFields = {
  role: "student",
  verified: false,
  verified_type: null,
};

/**
 * Pure port of the older defense-in-depth INSERT trigger. The Phase 0
 * migration removes authenticated INSERT privilege and its RLS policy, so a
 * direct client never reaches this trigger; it remains useful if grants are
 * accidentally broadened later. handle_new_user() and service-role inserts
 * keep their trusted values.
 */
export function applyProfileInsertPrivilegeDefaults(
  requestRole: string | null,
  attemptedProfile: ProfilePrivilegeFields
): ProfilePrivilegeFields {
  if (requestRole !== "authenticated") return attemptedProfile;
  return { ...attemptedProfile, ...PROFILE_PRIVILEGE_INSERT_DEFAULTS };
}
