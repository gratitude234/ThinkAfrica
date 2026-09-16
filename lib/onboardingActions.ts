"use server";

import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything the onboarding screen needs, in one server call: the profile
 * fields the two steps prefill, and whether the member already finished.
 *
 * The publishing reset, Phase 2G, cut this from four reads to two. The
 * onboarding path preference and the retired profile-record summary went with
 * the steps that used them.
 *
 * ## The distinction this exists to preserve
 *
 * Onboarding decides whether to redirect a member out of the flow, based on
 * `onboarding_completed`. A failed read makes that flag absent, and an absent
 * flag is falsy, so a database outage would read as "this member has not
 * finished onboarding" and drop a long-standing user back into setup.
 *
 * So the result is a discriminated union, and `unavailable` is not a state the
 * caller can accidentally treat as incomplete. It is unknown, and the screen
 * says so instead of acting. `completed` is only ever a real boolean read from
 * a successful response, so there is no value that could send somebody in a
 * loop.
 */

export interface OnboardingProfileSnapshot {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  interests: string[] | null;
}

export interface OnboardingState {
  userId: string;
  /** True only when the flag was actually read. Never a default. */
  completed: boolean;
  profile: OnboardingProfileSnapshot;
}

export type OnboardingResult =
  | { ok: true; data: OnboardingState }
  | { ok: false; reason: "unauthorized" | "unavailable" };

const PROFILE_SELECT = "full_name, username, avatar_url, bio, interests";

export async function loadOnboardingState(): Promise<OnboardingResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  try {
    const supabase = await createClient();

    const [profileResult, privateResult] = await Promise.all([
      supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single(),
      // Derives the actor from auth.uid(). It still works here, because this
      // runs on the server with the member's session; see
      // docs/read-migration-rpc-blockers.md.
      supabase.rpc("get_my_profile_private"),
    ]);

    // Either failing means the state is unknown. Reporting a partial answer
    // would let the screen act on a completion flag it did not read.
    if (profileResult.error || !profileResult.data) {
      console.error("[onboarding] profile read failed", profileResult.error);
      return { ok: false, reason: "unavailable" };
    }
    if (privateResult.error) {
      console.error("[onboarding] private profile failed", privateResult.error);
      return { ok: false, reason: "unavailable" };
    }

    // The private projection arrives as a single-row table, so it may be an
    // array.
    const privateRow = Array.isArray(privateResult.data)
      ? privateResult.data[0]
      : privateResult.data;
    const completed =
      (privateRow as { onboarding_completed?: unknown } | null)
        ?.onboarding_completed === true;

    return {
      ok: true,
      data: {
        userId: user.id,
        completed,
        profile: profileResult.data as unknown as OnboardingProfileSnapshot,
      },
    };
  } catch (error) {
    console.error("[onboarding] state load failed", error);
    return { ok: false, reason: "unavailable" };
  }
}
