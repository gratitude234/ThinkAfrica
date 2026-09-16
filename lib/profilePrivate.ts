/**
 * Owner-only fields returned by public.get_my_profile_private(). Public profile
 * queries must not select these columns once the pending SELECT contract is
 * promoted.
 *
 * The RPC also still returns push_prompt_shown_at, push_prompt_last_shown_at
 * and push_prompt_attempt_count, which only the retired Home permission banner
 * read. They are not normalized here (DATABASE DEFERRED, Phase 2F).
 */
export interface MyPrivateProfile {
  profile_id: string;
  signup_email: string | null;
  notification_prefs: unknown;
  privacy_settings: unknown;
  onboarding_completed: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  last_engagement_push_notified_at: string | null;
  last_comment_email_notified_at: string | null;
}

/**
 * PostgREST returns a TABLE-valued RPC as an array. Keeping normalization here
 * avoids each server/client surface making a different assumption about that
 * wire shape.
 */
export function normalizeMyPrivateProfile(value: unknown): MyPrivateProfile | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const row = candidate as Record<string, unknown>;
  if (typeof row.profile_id !== "string") return null;

  return {
    profile_id: row.profile_id,
    signup_email: typeof row.signup_email === "string" ? row.signup_email : null,
    notification_prefs: row.notification_prefs ?? null,
    privacy_settings: row.privacy_settings ?? null,
    onboarding_completed: row.onboarding_completed === true,
    suspended_at: typeof row.suspended_at === "string" ? row.suspended_at : null,
    suspended_reason:
      typeof row.suspended_reason === "string" ? row.suspended_reason : null,
    last_engagement_push_notified_at:
      typeof row.last_engagement_push_notified_at === "string"
        ? row.last_engagement_push_notified_at
        : null,
    last_comment_email_notified_at:
      typeof row.last_comment_email_notified_at === "string"
        ? row.last_comment_email_notified_at
        : null,
  };
}

/**
 * LEGACY COMPATIBILITY — retired `privacy_settings` keys, carried forward on save.
 *
 * Both privacy saves rebuild the jsonb column from the values they validate,
 * so a key the form no longer offers would be erased the next time a member
 * saved. `allow_messages` controlled who could start a conversation, and
 * messaging was removed in the publishing reset, Phase 2E. The stored value is
 * for the database cleanup phase to decide on, not for a settings save to
 * delete. Only a string value is carried, so nothing new can ride along.
 */
export const RETIRED_PRIVACY_SETTING_KEYS = ["allow_messages"] as const;

export function retainedPrivacySettings(stored: unknown): Record<string, string> {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};

  const retained: Record<string, string> = {};
  for (const key of RETIRED_PRIVACY_SETTING_KEYS) {
    const value = (stored as Record<string, unknown>)[key];
    if (typeof value === "string") retained[key] = value;
  }
  return retained;
}
