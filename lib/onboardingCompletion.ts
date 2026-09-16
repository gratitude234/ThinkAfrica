import "server-only";

import { recordActivationEvent } from "@/lib/activationServer";
import { getOnboardingProfileError } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marks a member's onboarding complete.
 *
 * ## Why this is not `complete_onboarding()`
 *
 * That database function is the retired four-step flow's own gate: it refuses
 * to finish without an onboarding path, a country, 3 to 5 topics and the
 * school or work fields of that path. The publishing reset, Phase 2G, needs
 * only a display name and a username, so calling it would refuse every member
 * who took the new flow. Redefining it is a migration, and a migration the new
 * flow depended on would break signup completion for as long as the deploy ran
 * ahead of it. So the rule moves here, and the function stays in the database,
 * unused, until the cleanup phase drops it.
 *
 * The write runs through the service role because
 * `guard_onboarding_measurement_fields()` rejects any change to the completion
 * columns made by the `authenticated` role, which is what keeps a browser from
 * marking itself done. That guard is unchanged and still does that job. This
 * function authorizes explicitly instead, in the order the project requires:
 * the caller resolved the viewer from the session, the row read is theirs, the
 * rule is checked against what is stored rather than what was sent, and the
 * affected row count is checked.
 *
 * `onboarding_completed_at` is what the Phase 0 baseline counts from, so it is
 * written in the same statement as the flag, exactly as the old function did.
 */

export type OnboardingCompletionResult =
  | { ok: true; alreadyCompleted: boolean }
  | { ok: false; reason: "incomplete_profile" | "not_found" | "unavailable" };

interface CompletionRow {
  full_name: string | null;
  username: string | null;
  onboarding_completed: boolean | null;
}

export async function completeOwnOnboarding(
  viewerId: string
): Promise<OnboardingCompletionResult> {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error(
      "[onboarding] completion unavailable",
      error instanceof Error ? error.message : error
    );
    return { ok: false, reason: "unavailable" };
  }

  const { data, error: readError } = await admin
    .from("profiles")
    .select("full_name, username, onboarding_completed")
    .eq("id", viewerId)
    .maybeSingle();

  if (readError) {
    console.error("[onboarding] completion read failed", readError.message);
    return { ok: false, reason: "unavailable" };
  }

  const profile = data as CompletionRow | null;
  if (!profile) return { ok: false, reason: "not_found" };
  if (profile.onboarding_completed === true) {
    return { ok: true, alreadyCompleted: true };
  }

  // Checked against the stored row, so a client that skipped the profile step
  // cannot finish by calling this directly.
  if (
    getOnboardingProfileError({
      fullName: profile.full_name ?? "",
      username: profile.username ?? "",
      bio: "",
    })
  ) {
    return { ok: false, reason: "incomplete_profile" };
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", viewerId)
    // Matches false and null alike, and never rewrites the timestamp of a
    // member another request already finished.
    .not("onboarding_completed", "is", true)
    .select("id");

  if (updateError) {
    console.error("[onboarding] completion write failed", updateError.message);
    return { ok: false, reason: "unavailable" };
  }

  if (((updated ?? []) as unknown[]).length === 0) {
    // Nothing matched. Either a second request finished first, which is a
    // success, or the row changed underneath, which is not. Read to tell.
    const { data: again } = await admin
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", viewerId)
      .maybeSingle();
    return (again as { onboarding_completed?: boolean | null } | null)
      ?.onboarding_completed === true
      ? { ok: true, alreadyCompleted: true }
      : { ok: false, reason: "unavailable" };
  }

  await recordActivationEvent({
    supabase: admin,
    event: "onboarding_completed",
    userId: viewerId,
    metadata: { measurement_version: 3 },
    source: "complete_onboarding_action",
    route: "/onboarding",
  });

  return { ok: true, alreadyCompleted: false };
}
