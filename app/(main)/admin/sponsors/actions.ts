"use server";

import { revalidatePath } from "next/cache";
import { createCheckedAdminClient } from "@/lib/supabase/admin";

const PLACEMENT_TYPES = new Set([
  "fellowship",
  "leaderboard",
  "policy_hub",
  "webinar",
]);

function actionError(error: unknown, fallback: string) {
  return { error: error instanceof Error ? error.message : fallback };
}

export async function createSponsorPlacement(input: {
  sponsor_name: string;
  placement_type: string;
  content: string;
  link_url: string;
  active: boolean;
}) {
  try {
    const sponsorName = input.sponsor_name.trim();
    if (!sponsorName) {
      return { error: "Sponsor name is required." };
    }

    const admin = await createCheckedAdminClient();
    const { error } = await admin.from("sponsor_placements").insert({
      sponsor_name: sponsorName,
      placement_type: PLACEMENT_TYPES.has(input.placement_type)
        ? input.placement_type
        : "leaderboard",
      content: input.content.trim() || null,
      link_url: input.link_url.trim() || null,
      active: input.active,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/sponsors");
    revalidatePath("/");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to create sponsor placement.");
  }
}

export async function toggleSponsorPlacement(sponsorId: string, active: boolean) {
  try {
    const admin = await createCheckedAdminClient();
    const { error } = await admin
      .from("sponsor_placements")
      .update({ active: !active })
      .eq("id", sponsorId);

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/admin/sponsors");
    revalidatePath("/");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update sponsor placement.");
  }
}
