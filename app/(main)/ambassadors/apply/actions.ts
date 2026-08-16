"use server";

import { revalidatePath } from "next/cache";
import { recordActivationEvent } from "@/lib/activationServer";
import { normalizeCampusName } from "@/lib/campus";
import { createClient } from "@/lib/supabase/server";

export async function submitAmbassadorApplication(input: {
  motivation: string;
  outreachPlan: string;
}) {
  const motivation = input.motivation.trim();
  const outreachPlan = input.outreachPlan.trim();
  if (motivation.length < 40 || motivation.length > 1500) {
    return { error: "Describe your motivation in 40 to 1,500 characters." };
  }
  if (outreachPlan.length < 40 || outreachPlan.length > 1500) {
    return { error: "Describe your campus plan in 40 to 1,500 characters." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("university")
    .eq("id", user.id)
    .maybeSingle();
  const university = normalizeCampusName(profile?.university ?? "");
  if (!university) {
    return { error: "Add your university in Settings before applying." };
  }

  const { data: cohort } = await supabase
    .from("campus_cohorts")
    .select("id, university")
    .in("status", ["selected", "active"])
    .ilike("university", university)
    .maybeSingle();
  if (!cohort) {
    return {
      error:
        "Ambassador applications are currently limited to selected campus cohorts.",
    };
  }

  const { error } = await supabase.from("campus_ambassadors").insert({
    user_id: user.id,
    campus_cohort_id: cohort.id,
    university: cohort.university,
    status: "pending",
    motivation,
    outreach_plan: outreachPlan,
  });
  if (error) {
    return {
      error:
        error.code === "23505" ? "You have already applied." : error.message,
    };
  }

  await recordActivationEvent({
    supabase,
    event: "ambassador_application_submitted",
    userId: user.id,
    source: "server_action",
    route: "/ambassadors/apply",
    metadata: { cohortId: cohort.id, university: cohort.university },
  });
  revalidatePath("/ambassadors");
  revalidatePath("/ambassadors/apply");
  revalidatePath("/admin/ambassadors");
  return { error: null };
}
