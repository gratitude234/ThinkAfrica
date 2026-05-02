"use server";

import { revalidatePath } from "next/cache";
import { createCheckedAdminClient } from "@/lib/supabase/admin";
import { isOpportunityType } from "@/lib/opportunities";

const APPLICATION_STATUSES = new Set([
  "pending",
  "shortlisted",
  "accepted",
  "rejected",
]);

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function createFellowship(input: {
  title: string;
  description: string;
  sponsor_name: string;
  amount: string;
  eligibility: string;
  deadline: string;
  application_url: string;
  opportunity_type: string;
  skills: string[];
  location: string;
  featured: boolean;
  status: string;
}) {
  try {
    const title = input.title.trim();
    if (!title) {
      return { error: "Title is required." };
    }

    const status = input.status === "closed" ? "closed" : "open";
    const opportunityType = isOpportunityType(input.opportunity_type)
      ? input.opportunity_type
      : "fellowship";

    const admin = await createCheckedAdminClient();
    const { error } = await admin.from("fellowships").insert({
      title,
      description: input.description.trim() || null,
      sponsor_name: input.sponsor_name.trim() || null,
      amount: input.amount.trim() || null,
      eligibility: input.eligibility.trim() || null,
      deadline: input.deadline ? new Date(input.deadline).toISOString() : null,
      application_url: input.application_url.trim() || null,
      opportunity_type: opportunityType,
      skills: input.skills.slice(0, 8),
      location: input.location.trim() || null,
      featured: input.featured,
      status,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/fellowships");
    revalidatePath("/opportunities");
    revalidatePath("/fellowships");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to create opportunity.");
  }
}

export async function updateFellowshipApplicationStatus(
  applicationId: string,
  status: string
) {
  try {
    if (!APPLICATION_STATUSES.has(status)) {
      return { error: "Invalid application status." };
    }

    const admin = await createCheckedAdminClient();
    const { error } = await admin
      .from("fellowship_applications")
      .update({ status })
      .eq("id", applicationId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/fellowships");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update application.");
  }
}
