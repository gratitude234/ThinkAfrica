"use server";

import { revalidatePath } from "next/cache";
import { createCheckedAdminClient } from "@/lib/supabase/admin";

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function updateAmbassadorStatus(
  ambassadorId: string,
  status: "active" | "inactive"
) {
  try {
    const admin = await createCheckedAdminClient();
    const { error } = await admin
      .from("campus_ambassadors")
      .update({ status })
      .eq("id", ambassadorId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/ambassadors");
    revalidatePath("/ambassadors");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update ambassador.");
  }
}
