/**
 * Pure port of protect_profile_privileged_columns(), the BEFORE UPDATE
 * trigger added to public.profiles by the Debate V2 Phase 1 hardening pass
 * (supabase/migrations/20260718000002_debate_v2_foundation.sql, section J).
 *
 * Not part of Debate V2 -- it protects public.profiles.role/verified/
 * verified_type from being changed by a direct client update, a
 * platform-wide privilege-escalation gap surfaced while auditing that
 * migration. Kept in its own module rather than lib/debateV2.ts since it has
 * nothing to do with the debate schema.
 *
 * This repo has no local Postgres harness to execute the real trigger (see
 * CLAUDE.md), so this port lets its branching logic run under `npm run
 * test`.
 */

export interface ProfilePrivilegeFields {
  role: string;
  verified: boolean;
  verified_type: string | null;
}

/**
 * Mirrors the trigger's `auth.role() = 'authenticated'` gate plus its three
 * `IS DISTINCT FROM` checks. Returns true exactly when the trigger would
 * RAISE EXCEPTION and reject the update.
 *
 * requestRole models auth.role(): 'authenticated' for an ordinary end-user
 * session, 'service_role' for the admin client (lib/adminAccess.ts,
 * createAdminClient()), or null for a connection with no JWT role claim at
 * all (direct SQL, migrations, the dashboard SQL editor).
 */
export function isProfilePrivilegeChangeBlocked(
  requestRole: string | null,
  oldProfile: ProfilePrivilegeFields,
  newProfile: ProfilePrivilegeFields
): boolean {
  if (requestRole !== "authenticated") return false;

  return (
    newProfile.role !== oldProfile.role ||
    newProfile.verified !== oldProfile.verified ||
    newProfile.verified_type !== oldProfile.verified_type
  );
}

export const PROFILE_PRIVILEGE_INSERT_DEFAULTS: ProfilePrivilegeFields = {
  role: "student",
  verified: false,
  verified_type: null,
};

/**
 * Correction pass: pure port of
 * protect_profile_privileged_columns_on_insert(), the BEFORE INSERT trigger
 * that closes the same escalation gap on profile creation. Unlike the
 * UPDATE trigger, it does not reject the insert -- it resets the three
 * privilege-bearing columns to their safe defaults (matching the table's
 * own column defaults) and returns the resulting row.
 *
 * requestRole models auth.role() exactly as in isProfilePrivilegeChangeBlocked.
 * handle_new_user() (supabase/migrations/20260423000010_campus_email_verification.sql)
 * inserts through Supabase Auth's own internal connection, which carries no
 * JWT role claim -- auth.role() reads null there, never 'authenticated' --
 * so this never touches the row it inserts, and automatic university-email
 * verification (is_university_email()) is unaffected.
 */
export function applyProfileInsertPrivilegeDefaults(
  requestRole: string | null,
  attemptedProfile: ProfilePrivilegeFields
): ProfilePrivilegeFields {
  if (requestRole !== "authenticated") return attemptedProfile;
  return { ...attemptedProfile, ...PROFILE_PRIVILEGE_INSERT_DEFAULTS };
}
