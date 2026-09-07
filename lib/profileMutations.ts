import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one place a member's own profile row is written.
 *
 * Nine separate client components used to run `.from("profiles").update(...)`
 * against an id they were handed as a prop. Every one of them was correct, and
 * every one of them was correct only because three things underneath refused
 * anything else: an RLS policy (`auth.uid() = id`), a column-level `GRANT
 * UPDATE` naming twenty columns, and `protect_profile_privileged_columns()`,
 * a default-deny trigger that rejects a write touching anything outside that
 * same list.
 *
 * Two of those three are Supabase-shaped and do not survive a direct
 * PostgreSQL connection the application authenticates to itself. So the
 * allowlist moves here, in front of the statement, in the same default-deny
 * shape: a column not named below is rejected, and adding a column to the
 * database does not quietly make it self-editable.
 *
 * The row is always the viewer's own. There is no `profileId` parameter
 * anywhere in this module, which is the point: the nine call sites all took
 * one, and an argument is something a browser can choose.
 */

/**
 * Exactly the columns `protect_profile_privileged_columns()` permits a direct
 * authenticated write to change, as of
 * `20260826000001_profile_positioning_statement.sql`.
 *
 * Kept in the same order as the SQL so the two can be read side by side, and
 * pinned against the migration by lib/profileMutations.test.ts. If that test
 * fails, the database and the application disagree about what a member may
 * edit, and the database is right.
 */
export const SELF_EDITABLE_PROFILE_COLUMNS = [
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
  "positioning_statement",
  "avatar_url",
  "cover_image_url",
  "interests",
  "graduation_year",
  "open_to_mentoring",
  "onboarding_completed",
  "notification_prefs",
  "privacy_settings",
] as const;

export type SelfEditableProfileColumn =
  (typeof SELF_EDITABLE_PROFILE_COLUMNS)[number];

/**
 * Named for the reader and for the privilege-escalation test, not as the
 * mechanism. The mechanism is the allowlist above: these are rejected because
 * they are absent from it, not because they appear here.
 *
 * `role` grants editorial and admin capability. `verified`/`verified_type`
 * are the platform's own attestation about a person. `points` and the
 * suspension columns are written by triggers and moderation, never by their
 * subject. `id` is the ownership key for 112 foreign keys.
 */
export const NEVER_SELF_EDITABLE_PROFILE_COLUMNS = [
  "id",
  "role",
  "verified",
  "verified_type",
  "points",
  "created_at",
  "suspended_at",
  "suspended_until",
  "suspension_reason",
  "signup_email",
] as const;

export type ProfilePatch = Partial<Record<SelfEditableProfileColumn, unknown>>;

const ALLOWED = new Set<string>(SELF_EDITABLE_PROFILE_COLUMNS);

export interface RejectedPatch {
  rejected: string[];
}

/**
 * Splits a patch into what may be written and what may not.
 *
 * Deliberately returns the rejected keys rather than silently dropping them.
 * A silent drop is how a caller comes to believe it saved something it did
 * not, and how a privilege-escalation attempt looks identical to a success.
 */
export function partitionProfilePatch(patch: Record<string, unknown>): {
  allowed: ProfilePatch;
  rejected: string[];
} {
  const allowed: Record<string, unknown> = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (ALLOWED.has(key)) {
      allowed[key] = value;
    } else {
      rejected.push(key);
    }
  }

  return { allowed: allowed as ProfilePatch, rejected };
}

export type ProfileUpdateFailure =
  | { reason: "forbidden_columns"; rejected: string[] }
  | { reason: "empty_patch" }
  | { reason: "username_taken" }
  | { reason: "query_failed" }
  | { reason: "not_found" };

/** PostgREST's code for a unique-constraint violation. The username index is
 *  the only unique constraint a self-service profile write can hit. */
const UNIQUE_VIOLATION = "23505";

/**
 * Writes the viewer's own profile row.
 *
 * Runs through the viewer's client rather than the service role on purpose:
 * RLS, the column grants and the guard trigger all stay underneath as a
 * backstop for as long as Supabase is the database. This function is the new
 * first line, not a replacement for them.
 *
 * `.select("id")` makes the write checkable. A PostgREST update that matches
 * no row reports success with an empty body, so without it a profile update
 * for a viewer whose row is missing would be indistinguishable from one that
 * worked.
 */
export async function updateOwnProfile(
  supabase: Pick<SupabaseClient, "from">,
  input: { viewerId: string; patch: Record<string, unknown> }
): Promise<{ ok: true } | { ok: false; failure: ProfileUpdateFailure }> {
  const { allowed, rejected } = partitionProfilePatch(input.patch);

  if (rejected.length > 0) {
    console.error(
      `[profileMutations] rejected non-self-editable columns: ${rejected.join(", ")}`
    );
    return { ok: false, failure: { reason: "forbidden_columns", rejected } };
  }

  if (Object.keys(allowed).length === 0) {
    return { ok: false, failure: { reason: "empty_patch" } };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(allowed)
    .eq("id", input.viewerId)
    .select("id");

  if (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
      return { ok: false, failure: { reason: "username_taken" } };
    }
    console.error("[profileMutations] profile update failed", error);
    return { ok: false, failure: { reason: "query_failed" } };
  }

  if (((data ?? []) as unknown[]).length === 0) {
    return { ok: false, failure: { reason: "not_found" } };
  }

  return { ok: true };
}

/** One sentence per failure, safe to show a member. A raw PostgREST message
 *  names columns, constraints and policies, which is not something a UI
 *  should ever be able to display. */
export function profileUpdateMessage(failure: ProfileUpdateFailure): string {
  switch (failure.reason) {
    case "username_taken":
      return "That username is already taken.";
    case "empty_patch":
      return "There was nothing to save.";
    case "forbidden_columns":
      return "That change is not allowed.";
    case "not_found":
      return "Your profile could not be found.";
    case "query_failed":
      return "Could not save your profile. Try again.";
  }
}
