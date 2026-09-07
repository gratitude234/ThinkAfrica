"use server";

import { createClient } from "@/lib/supabase/server";
import {
  fail,
  ok,
  requireViewer,
  type ActionResult,
  NOT_SIGNED_IN,
} from "@/lib/serverActions";

/**
 * The onboarding writes, moved out of the browser.
 *
 * These four are `SECURITY DEFINER` functions that derive the acting member
 * from `auth.uid()`, so a forged argument was never the risk: the risk is that
 * the browser holds a Supabase client at all, and that `auth.uid()` returns
 * NULL the day the database stops being Supabase. Behind a server action the
 * first problem is gone now and the second becomes a one-line change when
 * supabase/migrations/20260909000001_parameterize_identity_rpcs.sql is applied
 * and these start passing `p_user_id`.
 *
 * The RPCs still do their own validation, and it is still the validation that
 * decides: the checks here exist so a bad request is a sentence rather than a
 * PostgREST error string, not so the database can stop checking.
 *
 * Deliberately still the viewer's own Supabase client rather than the service
 * role, so `auth.uid()` inside each function resolves to the same member and
 * RLS stays underneath.
 */

const PATHS = ["student", "non_student"] as const;

function rpcFailure(context: string, error: { message?: string } | null) {
  console.error(`[onboarding] ${context} failed`, error);
}

export async function saveOnboardingPath(input: {
  currentPath: string;
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  if (!(PATHS as readonly string[]).includes(input.currentPath)) {
    return fail("Choose whether you are currently a student.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_onboarding_path", {
    p_current_path: input.currentPath,
  });

  if (error) {
    rpcFailure("save_onboarding_path", error);
    return fail("We couldn't save your choice. Please try again.");
  }
  return ok();
}

export interface SaveOnboardingIdentityInput {
  currentPath: string;
  workCategory: string | null;
  country: string;
  university: string | null;
  fieldOfStudy: string | null;
  graduationYear: number | null;
  professionalTitle: string | null;
  organizationName: string | null;
}

export async function saveOnboardingIdentity(
  input: SaveOnboardingIdentityInput
): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  if (!(PATHS as readonly string[]).includes(input.currentPath)) {
    return fail("Choose whether you are currently a student.");
  }
  if (
    input.graduationYear !== null &&
    (!Number.isInteger(input.graduationYear) ||
      input.graduationYear < 2015 ||
      input.graduationYear > 2040)
  ) {
    return fail("Choose a valid graduation year.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_onboarding_identity", {
    p_current_path: input.currentPath,
    p_work_category: input.workCategory,
    p_country: input.country,
    p_university: input.university,
    p_field_of_study: input.fieldOfStudy,
    p_graduation_year: input.graduationYear,
    p_professional_title: input.professionalTitle,
    p_organization_name: input.organizationName,
  });

  if (error) {
    rpcFailure("save_onboarding_identity", error);
    return fail("We couldn't save your profile details. Please try again.");
  }
  return ok();
}

export async function saveOnboardingTopics(input: {
  interests: string[];
}): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const interests = [...new Set(input.interests ?? [])].filter(
    (interest): interest is string =>
      typeof interest === "string" && interest.trim().length > 0
  );
  // The function's own allowlist is the authority on which topics are real.
  // This only bounds the size, so an obviously wrong request does not become a
  // database exception the UI has to translate.
  if (interests.length < 3 || interests.length > 5) {
    return fail("Choose 3 to 5 topics.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_onboarding_topics", {
    p_interests: interests,
  });

  if (error) {
    rpcFailure("save_onboarding_topics", error);
    return fail("We couldn't save your topics. Please try again.");
  }
  return ok();
}

export async function completeOnboarding(): Promise<ActionResult<null>> {
  const viewer = await requireViewer();
  if (!viewer) return fail(NOT_SIGNED_IN);

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding");

  if (error) {
    rpcFailure("complete_onboarding", error);
    return fail(
      "We couldn't finish your setup. Your information is saved, so you can try again."
    );
  }
  return ok();
}
