/**
 * Owner-only fields returned by public.get_my_profile_private(). Public profile
 * queries must not select these columns once the pending SELECT contract is
 * promoted.
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
  push_prompt_shown_at: string | null;
  push_prompt_last_shown_at: string | null;
  push_prompt_attempt_count: number;
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
    push_prompt_shown_at:
      typeof row.push_prompt_shown_at === "string" ? row.push_prompt_shown_at : null,
    push_prompt_last_shown_at:
      typeof row.push_prompt_last_shown_at === "string"
        ? row.push_prompt_last_shown_at
        : null,
    push_prompt_attempt_count:
      typeof row.push_prompt_attempt_count === "number"
        ? row.push_prompt_attempt_count
        : 0,
  };
}
