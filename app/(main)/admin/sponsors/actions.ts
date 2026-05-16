"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";

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

    const { admin, context } = await createAdminActionClient("sponsors.manage");
    const placementType = PLACEMENT_TYPES.has(input.placement_type)
      ? input.placement_type
      : "leaderboard";
    const { data, error } = await admin.from("sponsor_placements").insert({
      sponsor_name: sponsorName,
      placement_type: placementType,
      content: input.content.trim() || null,
      link_url: input.link_url.trim() || null,
      active: input.active,
    }).select("id").single();

    if (error) {
      return { error: error.message };
    }

    if (data?.id) {
      await recordAdminAuditEvent({
        admin,
        context,
        action: "sponsor_placement.created",
        targetTable: "sponsor_placements",
        targetId: data.id,
        metadata: {
          sponsorName,
          placementType,
          active: input.active,
        },
      });
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
    const { admin, context } = await createAdminActionClient("sponsors.manage");
    const nextActive = !active;
    const { error } = await admin
      .from("sponsor_placements")
      .update({ active: nextActive })
      .eq("id", sponsorId);

    if (error) {
      return { error: error.message };
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "sponsor_placement.visibility_toggled",
      targetTable: "sponsor_placements",
      targetId: sponsorId,
      metadata: { active: nextActive },
    });

    revalidatePath("/admin/sponsors");
    revalidatePath("/");
    return { error: null };
  } catch (error) {
    return actionError(error, "Unable to update sponsor placement.");
  }
}
