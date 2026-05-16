"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function featurePolicyBrief(input: {
  postId: string;
  institutionTarget: string;
}) {
  try {
    const { admin, context } = await createAdminActionClient("editorial.manage");
    const { error } = await admin.from("policy_briefs_featured").insert({
      post_id: input.postId,
      featured_by: context.userId,
      institution_target: input.institutionTarget.trim() || null,
    });

    if (error) {
      return { error: error.message };
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "policy_brief.featured_for_institutions",
      targetTable: "policy_briefs_featured",
      targetId: input.postId,
      metadata: {
        postId: input.postId,
        hasInstitutionTarget: Boolean(input.institutionTarget.trim()),
      },
    });

    revalidatePath("/policy");
    revalidatePath("/admin");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to feature policy brief.");
  }
}
