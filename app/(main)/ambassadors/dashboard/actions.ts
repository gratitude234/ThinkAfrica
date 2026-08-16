"use server";

import { revalidatePath } from "next/cache";
import {
  CAMPUS_ACTIVITY_TYPES,
  type CampusActivityType,
} from "@/lib/campus";
import { recordActivationEvent } from "@/lib/activationServer";
import { createClient } from "@/lib/supabase/server";

export async function recordAmbassadorActivity(input: {
  activityType: CampusActivityType;
  happenedOn: string;
  participantCount: number;
  notes?: string | null;
}) {
  if (!CAMPUS_ACTIVITY_TYPES.includes(input.activityType)) {
    return { error: "Choose a valid activity type." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.happenedOn)) {
    return { error: "Choose a valid activity date." };
  }
  const activityDate = new Date(`${input.happenedOn}T00:00:00Z`);
  if (Number.isNaN(activityDate.getTime()) || activityDate > new Date()) {
    return { error: "Activity cannot be recorded in the future." };
  }
  if (
    !Number.isInteger(input.participantCount) ||
    input.participantCount < 0 ||
    input.participantCount > 10000
  ) {
    return { error: "Participant count must be a whole number from 0 to 10,000." };
  }
  const notes = input.notes?.trim() ?? "";
  if (notes.length > 1000) return { error: "Notes can be at most 1,000 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: ambassador } = await supabase
    .from("campus_ambassadors")
    .select("id, campus_cohort_id, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!ambassador?.campus_cohort_id) {
    return { error: "An active selected-campus assignment is required." };
  }

  const { error } = await supabase.from("campus_ambassador_activity").insert({
    ambassador_id: ambassador.id,
    cohort_id: ambassador.campus_cohort_id,
    activity_type: input.activityType,
    happened_on: input.happenedOn,
    participant_count: input.participantCount,
    notes: notes || null,
  });
  if (error) return { error: error.message };

  await recordActivationEvent({
    supabase,
    event: "ambassador_activity_logged",
    userId: user.id,
    source: "server_action",
    route: "/ambassadors/dashboard",
    metadata: {
      cohortId: ambassador.campus_cohort_id,
      activityType: input.activityType,
      participantCount: input.participantCount,
    },
  });
  revalidatePath("/ambassadors/dashboard");
  revalidatePath("/admin/campuses");
  return { error: null };
}
