"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";

type TargetInput = number | string | null | undefined;
type ActionResult = { error: string | null };

function parseOptionalPositiveInteger(value: TargetInput) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 1_000_000) {
    return undefined;
  }
  return parsed;
}

export async function updateResearchExpansionTargets(input: {
  windowDays: TargetInput;
  proposalsCreated: TargetInput;
  activeProjects: TargetInput;
  acceptedCollaborations: TargetInput;
  completedProjects: TargetInput;
  publicUpdates: TargetInput;
  multimediaAssets: TargetInput;
}): Promise<ActionResult> {
  try {
    const windowDays = Number(input.windowDays);
    if (!Number.isInteger(windowDays) || windowDays < 30 || windowDays > 365) {
      return { error: "The measurement window must be 30 to 365 days." };
    }

    const targets = {
      proposals_created_target: parseOptionalPositiveInteger(input.proposalsCreated),
      active_projects_target: parseOptionalPositiveInteger(input.activeProjects),
      accepted_collaborations_target: parseOptionalPositiveInteger(
        input.acceptedCollaborations
      ),
      completed_projects_target: parseOptionalPositiveInteger(input.completedProjects),
      public_updates_target: parseOptionalPositiveInteger(input.publicUpdates),
      multimedia_assets_target: parseOptionalPositiveInteger(input.multimediaAssets),
    };

    if (Object.values(targets).some((target) => target === undefined)) {
      return { error: "Targets must be blank or positive whole numbers." };
    }

    const { admin, context } = await createAdminActionClient("analytics.view");
    const measurementStartedAt = new Date().toISOString();
    const { data, error } = await admin
      .from("research_expansion_targets")
      .update({
        window_days: windowDays,
        ...targets,
        measurement_started_at: measurementStartedAt,
        updated_by: context.userId,
        updated_at: measurementStartedAt,
      })
      .eq("scope", "global")
      .select("scope")
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Unable to save research targets." };
    }

    await recordAdminAuditEvent({
      admin,
      context,
      action: "research.expansion_targets_updated",
      targetTable: "research_expansion_targets",
      targetId: "global",
      metadata: { windowDays, ...targets, measurementStartedAt },
    });
    revalidatePath("/admin/research");
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to save research targets.",
    };
  }
}
