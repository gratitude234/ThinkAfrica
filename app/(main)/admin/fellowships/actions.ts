"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
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

    const { admin, context } = await createAdminActionClient("opportunities.manage");
    const { data, error } = await admin.from("fellowships").insert({
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
    }).select("id").single();

    if (error) {
      return { error: error.message };
    }

    if (data?.id) {
      await recordAdminAuditEvent({
        admin,
        context,
        action: "opportunity.created",
        targetTable: "fellowships",
        targetId: data.id,
        metadata: {
          title,
          status,
          opportunityType,
          featured: input.featured,
        },
      });
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
  status: string,
  reviewNote?: string
) {
  try {
    if (!APPLICATION_STATUSES.has(status)) {
      return { error: "Invalid application status." };
    }

    const { admin, context } = await createAdminActionClient("opportunities.manage");
    const note = reviewNote?.trim() || null;
    const { error } = await admin
      .from("fellowship_applications")
      .update({
        status,
        review_note: note,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", applicationId);

    if (error) {
      return { error: error.message };
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "opportunity_application.status_updated",
      targetTable: "fellowship_applications",
      targetId: applicationId,
      metadata: {
        status,
        hasReviewNote: Boolean(note),
      },
    });

    revalidatePath("/admin/fellowships");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update application.");
  }
}
