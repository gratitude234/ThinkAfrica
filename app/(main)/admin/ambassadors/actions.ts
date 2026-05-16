"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function updateAmbassadorStatus(
  ambassadorId: string,
  status: "active" | "inactive"
) {
  try {
    const { admin, context } = await createAdminActionClient("ambassadors.manage");
    const { error } = await admin
      .from("campus_ambassadors")
      .update({ status })
      .eq("id", ambassadorId);

    if (error) {
      return { error: error.message };
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "ambassador.status_updated",
      targetTable: "campus_ambassadors",
      targetId: ambassadorId,
      metadata: { status },
    });

    revalidatePath("/admin/ambassadors");
    revalidatePath("/ambassadors");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update ambassador.");
  }
}
