"use server";

import { getCurrentUser } from "@/lib/serverAuth";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything the onboarding screen needs, in one server call.
 *
 * The client used to issue four requests against the anon key: the profile
 * row, the private profile RPC, the onboarding preference RPC, and the record
 * summary. RLS and two `auth.uid()` functions made them safe, and neither has
 * a successor once the browser holds no database credential.
 *
 * ## The distinction this exists to preserve
 *
 * Onboarding decides whether to redirect a member out of the flow, based on
 * `onboarding_completed`. A failed read makes that flag absent, and an absent
 * flag is falsy, so a database outage would read as "this member has not
 * finished onboarding" and drop a long-standing user back into the setup
 * wizard.
 *
 * So the result is a discriminated union, and `unavailable` is not a state the
 * caller can accidentally treat as incomplete. It is neither complete nor
 * incomplete: it is unknown, and the screen says so instead of acting.
 *
 * ## Redirect safety
 *
 * The redirect is still decided by the client, from `completed`, and
 * `completed` is only ever a real boolean read from a successful response. A
 * failure returns no `completed` at all, so there is no value that could send
 * somebody in a loop.
 */

export interface OnboardingProfileSnapshot {
  full_name: string | null;
  profile_type: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  professional_title: string | null;
  organization_name: string | null;
  interests: string[] | null;
}

export interface OnboardingState {
  userId: string;
  /** True only when the flag was actually read. Never a default. */
  completed: boolean;
  profile: OnboardingProfileSnapshot;
  /** The stored preference payload, normalised by the caller as before. */
  preference: unknown;
  /** The record summary payload, normalised by the caller as before. */
  record: unknown;
}

export type OnboardingResult =
  | { ok: true; data: OnboardingState }
  | { ok: false; reason: "unauthorized" | "unavailable" };

const PROFILE_SELECT =
  "full_name, profile_type, country, university, field_of_study, graduation_year, professional_title, organization_name, interests";

export async function loadOnboardingState(): Promise<OnboardingResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "unauthorized" };

  try {
    const supabase = await createClient();

    const [profileResult, privateResult, preferenceResult, recordResult] =
      await Promise.all([
        supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single(),
        // These two derive the actor from auth.uid(). They still work here,
        // because this runs on the server with the member's session. Pointing
        // them at private.*_impl is a separate change, gated on applying the
        // identity migrations; see docs/read-migration-rpc-blockers.md.
        supabase.rpc("get_my_profile_private"),
        supabase.rpc("get_my_onboarding_state"),
        supabase.rpc("get_public_profile_record_summary", {
          p_profile_id: user.id,
          p_include_research: false,
        }),
      ]);

    // Any of the four failing means the state is unknown. Reporting a partial
    // answer would let the screen act on a completion flag it did not read.
    if (profileResult.error || !profileResult.data) {
      console.error("[onboarding] profile read failed", profileResult.error);
      return { ok: false, reason: "unavailable" };
    }
    if (privateResult.error) {
      console.error("[onboarding] private profile failed", privateResult.error);
      return { ok: false, reason: "unavailable" };
    }
    if (preferenceResult.error) {
      console.error("[onboarding] preference read failed", preferenceResult.error);
      return { ok: false, reason: "unavailable" };
    }
    if (recordResult.error) {
      console.error("[onboarding] record summary failed", recordResult.error);
      return { ok: false, reason: "unavailable" };
    }

    // The private projection arrives as a single-row table, so it may be an
    // array. The completion flag is read here rather than in the browser
    // because it is the one value a redirect turns on.
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
        preference: preferenceResult.data,
        record: recordResult.data,
      },
    };
  } catch (error) {
    console.error("[onboarding] state load failed", error);
    return { ok: false, reason: "unavailable" };
  }
}
