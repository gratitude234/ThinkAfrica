"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function featurePolicyBrief(input: {
  postId: string;
  institutionTarget: string;
}) {
  try {
    const { user } = await requireAdmin();
    const admin = createAdminClient();
    const { error } = await admin.from("policy_briefs_featured").insert({
      post_id: input.postId,
      featured_by: user.id,
      institution_target: input.institutionTarget.trim() || null,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/policy");
    revalidatePath("/admin");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to feature policy brief.");
  }
}
