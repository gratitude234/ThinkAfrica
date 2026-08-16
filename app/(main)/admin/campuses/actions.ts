"use server";

import { revalidatePath } from "next/cache";
import {
  createAdminActionClient,
  recordAdminAuditEvent,
} from "@/lib/adminAccess";
import {
  CAMPUS_COHORT_STATUSES,
  CAMPUS_PROGRAM_FORMATS,
  CAMPUS_PROGRAM_RECURRENCES,
  CAMPUS_PROMPT_CADENCES,
  normalizeCampusName,
  parseOptionalPercentage,
  type CampusCohortStatus,
  type CampusProgramFormat,
  type CampusProgramRecurrence,
  type CampusPromptCadence,
} from "@/lib/campus";

type ActionResult = { error: string | null };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResult(error: unknown, fallback: string): ActionResult {
  return { error: error instanceof Error ? error.message : fallback };
}

function cleanOptionalText(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.trim() ?? "";
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function isIsoDateTime(value: string | null | undefined) {
  return !value || !Number.isNaN(Date.parse(value));
}

export async function createCampusCohort(input: {
  university: string;
  country?: string | null;
  status: CampusCohortStatus;
  cohortStart: string;
  cohortEnd?: string | null;
  d7RetentionTarget?: number | string | null;
  d30RetentionTarget?: number | string | null;
  secondPublication30dTarget?: number | string | null;
  responseReceived30dTarget?: number | string | null;
}): Promise<ActionResult> {
  try {
    const university = normalizeCampusName(input.university);
    if (university.length < 2 || university.length > 160) {
      return { error: "Enter a valid university name." };
    }
    if (!CAMPUS_COHORT_STATUSES.includes(input.status)) {
      return { error: "Choose a valid cohort status." };
    }
    if (!isIsoDate(input.cohortStart) || (input.cohortEnd && !isIsoDate(input.cohortEnd))) {
      return { error: "Choose valid cohort dates." };
    }
    if (input.cohortEnd && input.cohortEnd < input.cohortStart) {
      return { error: "The cohort end date cannot be before its start date." };
    }

    const targets = {
      d7_retention_target: parseOptionalPercentage(input.d7RetentionTarget),
      d30_retention_target: parseOptionalPercentage(input.d30RetentionTarget),
      second_publication_30d_target: parseOptionalPercentage(
        input.secondPublication30dTarget
      ),
      response_received_30d_target: parseOptionalPercentage(
        input.responseReceived30dTarget
      ),
    };
    if (Object.values(targets).some((value) => value === undefined)) {
      return { error: "Retention targets must be percentages from 0 to 100." };
    }

    const { admin, context } = await createAdminActionClient("ambassadors.manage");
    const { data, error } = await admin
      .from("campus_cohorts")
      .insert({
        university,
        country: cleanOptionalText(input.country, 100),
        status: input.status,
        cohort_start: input.cohortStart,
        cohort_end: input.cohortEnd || null,
        ...targets,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error || !data) return { error: error?.message ?? "Unable to create cohort." };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "campus.cohort_created",
      targetTable: "campus_cohorts",
      targetId: data.id,
      metadata: { university, status: input.status },
    });
    revalidatePath("/admin/campuses");
    revalidatePath("/campus");
    revalidatePath("/ambassadors");
    return { error: null };
  } catch (error) {
    return errorResult(error, "Unable to create cohort.");
  }
}

export async function updateCampusCohortStatus(
  cohortId: string,
  status: CampusCohortStatus
): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(cohortId) || !CAMPUS_COHORT_STATUSES.includes(status)) {
      return { error: "Invalid cohort update." };
    }
    const { admin, context } = await createAdminActionClient("ambassadors.manage");
    const { error } = await admin
      .from("campus_cohorts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", cohortId);
    if (error) return { error: error.message };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "campus.cohort_status_updated",
      targetTable: "campus_cohorts",
      targetId: cohortId,
      metadata: { status },
    });
    revalidatePath("/admin/campuses");
    revalidatePath("/campus");
    revalidatePath("/ambassadors");
    return { error: null };
  } catch (error) {
    return errorResult(error, "Unable to update cohort.");
  }
}

export async function updateCampusCohortTargets(input: {
  cohortId: string;
  d7RetentionTarget?: number | string | null;
  d30RetentionTarget?: number | string | null;
  secondPublication30dTarget?: number | string | null;
  responseReceived30dTarget?: number | string | null;
}): Promise<ActionResult> {
  try {
    if (!UUID_PATTERN.test(input.cohortId)) return { error: "Invalid cohort." };
    const targets = {
      d7_retention_target: parseOptionalPercentage(input.d7RetentionTarget),
      d30_retention_target: parseOptionalPercentage(input.d30RetentionTarget),
      second_publication_30d_target: parseOptionalPercentage(
        input.secondPublication30dTarget
      ),
      response_received_30d_target: parseOptionalPercentage(
        input.responseReceived30dTarget
      ),
    };
    if (Object.values(targets).some((value) => value === undefined)) {
      return { error: "Retention targets must be percentages from 0 to 100." };
    }

    const { admin, context } = await createAdminActionClient("ambassadors.manage");
    const { error } = await admin
      .from("campus_cohorts")
      .update({ ...targets, updated_at: new Date().toISOString() })
      .eq("id", input.cohortId);
    if (error) return { error: error.message };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "campus.cohort_targets_updated",
      targetTable: "campus_cohorts",
      targetId: input.cohortId,
      metadata: targets,
    });
    revalidatePath("/admin/campuses");
    return { error: null };
  } catch (error) {
    return errorResult(error, "Unable to update cohort targets.");
  }
}

export async function createCampusEditorialPrompt(input: {
  cohortId: string;
  title: string;
  promptText: string;
  responseQuestion?: string | null;
  topic?: string | null;
  cadence: CampusPromptCadence;
  startsAt: string;
  endsAt?: string | null;
}): Promise<ActionResult> {
  try {
    const title = input.title.trim();
    const promptText = input.promptText.trim();
    if (!UUID_PATTERN.test(input.cohortId)) return { error: "Choose a cohort." };
    if (title.length < 3 || title.length > 120) {
      return { error: "Prompt titles must be 3 to 120 characters." };
    }
    if (promptText.length < 10 || promptText.length > 1000) {
      return { error: "Prompt text must be 10 to 1,000 characters." };
    }
    if (!CAMPUS_PROMPT_CADENCES.includes(input.cadence)) {
      return { error: "Choose a valid prompt cadence." };
    }
    if (!isIsoDateTime(input.startsAt) || !isIsoDateTime(input.endsAt)) {
      return { error: "Choose valid prompt dates." };
    }
    if (input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
      return { error: "The prompt end must be after its start." };
    }

    const { admin, context } = await createAdminActionClient("ambassadors.manage");
    const { data, error } = await admin
      .from("campus_editorial_prompts")
      .insert({
        cohort_id: input.cohortId,
        title,
        prompt_text: promptText,
        response_question: cleanOptionalText(input.responseQuestion, 500),
        topic: cleanOptionalText(input.topic, 80),
        cadence: input.cadence,
        starts_at: new Date(input.startsAt).toISOString(),
        ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Unable to create prompt." };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "campus.prompt_created",
      targetTable: "campus_editorial_prompts",
      targetId: data.id,
      metadata: { cohortId: input.cohortId, cadence: input.cadence },
    });
    revalidatePath("/admin/campuses");
    revalidatePath("/campus");
    return { error: null };
  } catch (error) {
    return errorResult(error, "Unable to create prompt.");
  }
}

export async function createCampusProgram(input: {
  cohortId: string;
  title: string;
  description: string;
  format: CampusProgramFormat;
  recurrence: CampusProgramRecurrence;
  nextSessionAt?: string | null;
}): Promise<ActionResult> {
  try {
    const title = input.title.trim();
    const description = input.description.trim();
    if (!UUID_PATTERN.test(input.cohortId)) return { error: "Choose a cohort." };
    if (title.length < 3 || title.length > 120) {
      return { error: "Program titles must be 3 to 120 characters." };
    }
    if (description.length < 10 || description.length > 1000) {
      return { error: "Program descriptions must be 10 to 1,000 characters." };
    }
    if (!CAMPUS_PROGRAM_FORMATS.includes(input.format)) {
      return { error: "Choose a valid program format." };
    }
    if (!CAMPUS_PROGRAM_RECURRENCES.includes(input.recurrence)) {
      return { error: "Choose a valid recurrence." };
    }
    if (!isIsoDateTime(input.nextSessionAt)) {
      return { error: "Choose a valid next session date." };
    }

    const { admin, context } = await createAdminActionClient("ambassadors.manage");
    const { data, error } = await admin
      .from("campus_programs")
      .insert({
        cohort_id: input.cohortId,
        title,
        description,
        format: input.format,
        recurrence: input.recurrence,
        next_session_at: input.nextSessionAt
          ? new Date(input.nextSessionAt).toISOString()
          : null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Unable to create program." };

    await recordAdminAuditEvent({
      admin,
      context,
      action: "campus.program_created",
      targetTable: "campus_programs",
      targetId: data.id,
      metadata: {
        cohortId: input.cohortId,
        format: input.format,
        recurrence: input.recurrence,
      },
    });
    revalidatePath("/admin/campuses");
    revalidatePath("/campus");
    return { error: null };
  } catch (error) {
    return errorResult(error, "Unable to create program.");
  }
}
