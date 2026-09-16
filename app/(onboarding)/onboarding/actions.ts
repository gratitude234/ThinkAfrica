"use server";

import { INTEREST_LABELS } from "@/lib/interests";
import { getOnboardingProfileError } from "@/lib/onboarding";
import { completeOwnOnboarding } from "@/lib/onboardingCompletion";
import { profileUpdateMessage, updateOwnProfile } from "@/lib/profileMutations";
import { normalizeProfileUsername } from "@/lib/profileUsername";
import {
  fail,
  ok,
  requireViewer,
  type ActionResult,
  NOT_SIGNED_IN,
} from "@/lib/serverActions";
import { createClient } from "@/lib/supabase/server";

/**
 * The onboarding writes: the profile step, the topics step, and completion.
 *
 * The publishing reset, Phase 2G, replaced the four identity RPCs this file
 * used to call (path, identity, topics and completion). The two profile
 * writes now go through `updateOwnProfile`, the same column allowlist every
 * other profile edit uses, and write only what the steps collect. Nothing
 * here writes a persona, a school, a work category or an onboarding path, and
 * nothing clears a value an older flow stored.
 *
 * The viewer is resolved from the session in every action. No action takes a
 * profile id.
 */

export async function saveOnboardingProfile(input: {
  fullName: string;
  username: string;
  bio: string;
}): Promise<ActionResult<{ username: string }>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const draft = {
    fullName: String(input.fullName ?? ""),
    username: String(input.username ?? ""),
    bio: String(input.bio ?? ""),
  };
  const problem = getOnboardingProfileError(draft);
  if (problem) return fail(problem);

  const username = normalizeProfileUsername(draft.username);
  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: {
      full_name: draft.fullName.trim(),
      username,
      bio: draft.bio.trim(),
    },
  });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  return ok({ username });
}

export async function saveOnboardingTopics(input: {
  interests: string[];
}): Promise<ActionResult<{ interests: string[] }>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const requested = Array.isArray(input.interests) ? input.interests : [];
  const interests = [...new Set(requested)];
  // Any number, including none: topics are optional. What is offered is the
  // curated list, so anything else is a malformed request rather than a topic.
  if (interests.some((interest) => typeof interest !== "string" || !INTEREST_LABELS.includes(interest))) {
    return fail("Choose topics from the list.");
  }

  const supabase = await createClient();
  const result = await updateOwnProfile(supabase, {
    viewerId: viewer.userId,
    patch: { interests },
  });
  if (!result.ok) return fail(profileUpdateMessage(result.failure));

  return ok({ interests });
}

export async function completeOnboarding(): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const result = await completeOwnOnboarding(viewer.userId);
  if (!result.ok) {
    return fail(
      result.reason === "incomplete_profile"
        ? "Add your name and a username first."
        : "We couldn't finish your setup. Your information is saved, so you can try again."
    );
  }
  return ok();
}
