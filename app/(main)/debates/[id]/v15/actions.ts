"use server";

import { revalidatePath } from "next/cache";
import {
  deliverDebateV15Event,
  type DebateV15DeliveryEvent,
} from "@/lib/debateV15Delivery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  DebateV15ActionResult,
  DebateV15Profile,
  DebateV15Phase,
  DebateV15Stance,
} from "./types";

type RpcPayload = Record<string, string | number | boolean | object | null>;
type RpcData = Record<string, unknown>;

type DebateDeliveryRow = {
  title: string;
  moderator_id: string | null;
  cancellation_reason: string | null;
};

type DebateDeliverySlotRow = {
  user_id: string;
  stance: DebateV15Stance;
  status: "invited" | "accepted" | "declined";
};

type ProfileNameRow = {
  username: string | null;
  full_name: string | null;
};

type RpcExecution = {
  result: DebateV15ActionResult;
  data: RpcData | null;
};

function rpcMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;

  const result = data as Record<string, unknown>;
  if (result.ok === false || result.success === false) {
    if (typeof result.error === "string") return result.error;
    if (typeof result.message === "string") return result.message;
    return "The action could not be completed.";
  }

  return null;
}

function asRpcData(data: unknown): RpcData | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as RpcData)
    : null;
}

async function executeDebateRpc(
  debateId: string,
  name: string,
  payload: RpcPayload
): Promise<RpcExecution> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, payload);
  const rpcData = asRpcData(data);

  if (error) {
    return {
      result: { ok: false, message: error.message },
      data: rpcData,
    };
  }

  if (rpcData?.outcome === "stale_no_op") {
    revalidatePath(`/debates/${debateId}`);
    return {
      result: {
        ok: true,
        message:
          "This debate changed in another session. The latest state is now shown.",
      },
      data: rpcData,
    };
  }

  const resultError = rpcMessage(data);
  if (resultError) {
    return {
      result: { ok: false, message: resultError },
      data: rpcData,
    };
  }

  revalidatePath(`/debates/${debateId}`);
  revalidatePath("/debates");
  return { result: { ok: true }, data: rpcData };
}

async function runDebateRpc(
  debateId: string,
  name: string,
  payload: RpcPayload
): Promise<DebateV15ActionResult> {
  const execution = await executeDebateRpc(debateId, name, payload);
  return execution.result;
}

function rpcString(data: RpcData | null, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" ? value : null;
}

async function loadDebateDeliveryRow(
  debateId: string
): Promise<DebateDeliveryRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("debates")
    .select("title, moderator_id, cancellation_reason")
    .eq("id", debateId)
    .maybeSingle<DebateDeliveryRow>();

  if (error) throw new Error(error.message);
  return data;
}

async function loadDebateDeliverySlots(
  debateId: string
): Promise<DebateDeliverySlotRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("debate_slots_v1_5")
    .select("user_id, stance, status")
    .eq("debate_id", debateId);

  if (error) throw new Error(error.message);
  return (data ?? []) as DebateDeliverySlotRow[];
}

async function loadProfileName(userId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("username, full_name")
    .eq("id", userId)
    .maybeSingle<ProfileNameRow>();

  if (error) throw new Error(error.message);
  return data?.full_name?.trim() || data?.username?.trim() || "A debater";
}

async function currentActorId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function attemptDebateDelivery(
  context: string,
  work: () => Promise<void>
): Promise<void> {
  try {
    await work();
  } catch (error) {
    console.error(
      `Debate V1.5 notification preparation failed for ${context}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function deliverToRecipients(
  recipients: string[],
  event: (recipientId: string) => DebateV15DeliveryEvent
): Promise<void> {
  await Promise.all(
    [...new Set(recipients)].map((recipientId) =>
      deliverDebateV15Event(event(recipientId))
    )
  );
}

export async function inviteDebaterV15Action(
  debateId: string,
  userId: string,
  stance: DebateV15Stance
) {
  const execution = await executeDebateRpc(debateId, "invite_debater_v1_5", {
    p_debate_id: debateId,
    p_user_id: userId,
    p_stance: stance,
  });

  if (!execution.result.ok || execution.data?.outcome !== "invited") {
    return execution.result;
  }

  await attemptDebateDelivery(`invitation:${debateId}`, async () => {
    const debate = await loadDebateDeliveryRow(debateId);
    const recipientId = rpcString(execution.data, "user_id");
    const authoritativeStance = rpcString(execution.data, "stance");
    if (
      !debate ||
      !recipientId ||
      (authoritativeStance !== "for" && authoritativeStance !== "against")
    ) {
      throw new Error("The saved invitation could not be prepared for delivery.");
    }

    await deliverDebateV15Event({
      kind: "invitation",
      recipientId,
      debateId,
      debateTitle: debate.title,
      stance: authoritativeStance,
    });
  });

  return {
    ok: true,
    message:
      "Invitation recorded. They’ll receive an in-app alert, plus email and push where enabled.",
  };
}

export async function respondToDebateInvitationV15Action(
  debateId: string,
  accept: boolean
) {
  const execution = await executeDebateRpc(
    debateId,
    "respond_to_debate_invitation_v1_5",
    {
      p_debate_id: debateId,
      p_accept: accept,
    }
  );

  const outcome = execution.data?.outcome;
  if (
    !execution.result.ok ||
    (outcome !== "accepted" && outcome !== "declined")
  ) {
    return execution.result;
  }

  await attemptDebateDelivery(`invitation-response:${debateId}`, async () => {
    const [debate, actorId] = await Promise.all([
      loadDebateDeliveryRow(debateId),
      currentActorId(),
    ]);
    if (!debate?.moderator_id || !actorId || debate.moderator_id === actorId) {
      return;
    }
    const participantName = await loadProfileName(actorId);
    await deliverDebateV15Event({
      kind: "invitation_response",
      recipientId: debate.moderator_id,
      debateId,
      debateTitle: debate.title,
      participantName,
      response: outcome,
    });
  });

  return execution.result;
}

export async function revokeDebateInvitationV15Action(
  debateId: string,
  stance: DebateV15Stance
) {
  const execution = await executeDebateRpc(
    debateId,
    "revoke_debate_invitation_v1_5",
    {
      p_debate_id: debateId,
      p_stance: stance,
    }
  );

  if (!execution.result.ok || execution.data?.outcome !== "revoked") {
    return execution.result;
  }

  await attemptDebateDelivery(`invitation-withdrawn:${debateId}`, async () => {
    const debate = await loadDebateDeliveryRow(debateId);
    const recipientId = rpcString(execution.data, "user_id");
    const authoritativeStance = rpcString(execution.data, "stance");
    if (
      !debate ||
      !recipientId ||
      (authoritativeStance !== "for" && authoritativeStance !== "against")
    ) {
      throw new Error(
        "The withdrawn invitation could not be prepared for delivery."
      );
    }
    await deliverDebateV15Event({
      kind: "invitation_withdrawn",
      recipientId,
      debateId,
      debateTitle: debate.title,
      stance: authoritativeStance,
    });
  });

  return execution.result;
}

export async function startDebateV15Action(debateId: string) {
  const execution = await executeDebateRpc(debateId, "start_debate_v1_5", {
    p_debate_id: debateId,
    p_expected_phase: "recruiting",
  });

  if (!execution.result.ok || execution.data?.outcome !== "started") {
    return execution.result;
  }

  await attemptDebateDelivery(`phase-opening:${debateId}`, async () => {
    const [debate, slots, actorId] = await Promise.all([
      loadDebateDeliveryRow(debateId),
      loadDebateDeliverySlots(debateId),
      currentActorId(),
    ]);
    if (!debate) throw new Error("Debate not found after starting.");
    await deliverToRecipients(
      slots
        .filter((slot) => slot.status === "accepted" && slot.user_id !== actorId)
        .map((slot) => slot.user_id),
      (recipientId) => ({
        kind: "phase_opened",
        recipientId,
        debateId,
        debateTitle: debate.title,
        phase: "opening",
      })
    );
  });

  return execution.result;
}

export interface DebateV15SourceInput {
  url: string;
  title?: string;
}

export async function submitDebateArgumentV15Action(
  debateId: string,
  content: string,
  sources: DebateV15SourceInput[]
) {
  return runDebateRpc(debateId, "submit_debate_argument_v1_5", {
    p_debate_id: debateId,
    p_content: content,
    p_sources: sources,
  });
}

export async function castFinalVoteV15Action(
  debateId: string,
  vote: DebateV15Stance
) {
  return runDebateRpc(debateId, "cast_final_vote_v1_5", {
    p_debate_id: debateId,
    p_vote: vote,
  });
}

export async function toggleArgumentUpvoteV15Action(
  debateId: string,
  argumentId: string
) {
  return runDebateRpc(debateId, "toggle_debate_vote", {
    p_argument_id: argumentId,
  });
}

export async function advanceDebatePhaseV15Action(
  debateId: string,
  expectedPhase: "opening" | "rebuttal"
) {
  const execution = await executeDebateRpc(
    debateId,
    "advance_debate_phase_v1_5",
    {
      p_debate_id: debateId,
      p_expected_phase: expectedPhase,
    }
  );
  const phase = rpcString(execution.data, "current_phase");
  if (
    !execution.result.ok ||
    execution.data?.outcome !== "advanced" ||
    (phase !== "rebuttal" && phase !== "voting")
  ) {
    return execution.result;
  }

  await attemptDebateDelivery(`phase-${phase}:${debateId}`, async () => {
    const [debate, slots, actorId] = await Promise.all([
      loadDebateDeliveryRow(debateId),
      loadDebateDeliverySlots(debateId),
      currentActorId(),
    ]);
    if (!debate) throw new Error("Debate not found after advancing.");
    await deliverToRecipients(
      slots
        .filter((slot) => slot.status === "accepted" && slot.user_id !== actorId)
        .map((slot) => slot.user_id),
      (recipientId) => ({
        kind: "phase_opened",
        recipientId,
        debateId,
        debateTitle: debate.title,
        phase,
      })
    );
  });

  return execution.result;
}

export async function extendDeadlineV15Action(
  debateId: string,
  which: "recruiting" | "opening" | "rebuttal" | "voting",
  expectedCurrentValue: string,
  newDeadline: string
) {
  return runDebateRpc(debateId, "extend_deadline_v1_5", {
    p_debate_id: debateId,
    p_which: which,
    p_new_deadline: newDeadline,
    p_expected_current_value: expectedCurrentValue,
  });
}

export async function cancelDebateV15Action(
  debateId: string,
  reason: string
) {
  const execution = await executeDebateRpc(debateId, "cancel_debate_v1_5", {
    p_debate_id: debateId,
    p_reason: reason,
  });

  if (!execution.result.ok || execution.data?.outcome !== "cancelled") {
    return execution.result;
  }

  await attemptDebateDelivery(`cancelled:${debateId}`, async () => {
    const [debate, slots, actorId] = await Promise.all([
      loadDebateDeliveryRow(debateId),
      loadDebateDeliverySlots(debateId),
      currentActorId(),
    ]);
    const cancellationReason = debate?.cancellation_reason;
    if (!debate || !cancellationReason) {
      throw new Error("Cancelled debate details were unavailable.");
    }
    await deliverToRecipients(
      slots
        .filter(
          (slot) =>
            (slot.status === "invited" || slot.status === "accepted") &&
            slot.user_id !== actorId
        )
        .map((slot) => slot.user_id),
      (recipientId) => ({
        kind: "cancelled",
        recipientId,
        debateId,
        debateTitle: debate.title,
        reason: cancellationReason,
      })
    );
  });

  return execution.result;
}

async function requestRecap(debateId: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = await fetch(`${appUrl}/api/debate-recap`, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.ADMIN_SECRET ?? "",
    },
    body: JSON.stringify({ debateId }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Recap generation request failed.");
  }
}

export async function completeDebateV15Action(debateId: string) {
  const result = await runDebateRpc(debateId, "complete_debate_v1_5", {
    p_debate_id: debateId,
    p_expected_phase: "voting",
  });

  if (!result.ok) return result;

  try {
    await requestRecap(debateId);
  } catch {
    // Completion is authoritative even when the internal recap request
    // cannot be reached. If the route never claimed the pending job, make
    // that failure durable so the room offers a retry instead of polling
    // "pending" forever. A route that already claimed the job owns its own
    // generating -> ready/failed transition.
    try {
      const admin = createAdminClient();
      await admin
        .from("debates")
        .update({
          recap_status: "failed",
          recap_error: "Recap generation did not complete. Please retry.",
        })
        .eq("id", debateId)
        .eq("recap_status", "pending");
      revalidatePath(`/debates/${debateId}`);
    } catch {
      // The verdict remains complete even if neither recap path is
      // configured. Deployment verification reports this configuration.
    }
  }

  return result;
}

export async function retryDebateRecapV15Action(
  debateId: string
): Promise<DebateV15ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in to retry this recap." };
  }

  const [{ data: debate }, { data: profile }] = await Promise.all([
    supabase
      .from("debates")
      .select(
        "moderator_id, debate_variant, status, current_phase, recap_status"
      )
      .eq("id", debateId)
      .maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const isManager =
    debate?.moderator_id === user.id ||
    profile?.role === "editor" ||
    profile?.role === "admin";
  const canRetry =
    debate?.debate_variant === "v1_5" &&
    debate.status === "closed" &&
    debate.current_phase === "completed" &&
    (debate.recap_status === "failed" || debate.recap_status === "pending");

  if (!isManager || !canRetry) {
    return {
      ok: false,
      message: "This recap is not available for retry.",
    };
  }

  try {
    await requestRecap(debateId);
    revalidatePath(`/debates/${debateId}`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "The recap could not be restarted. Please try again.",
    };
  }
}

export async function remindVotersV15Action(debateId: string) {
  return runDebateRpc(debateId, "remind_debate_voters_v1_5", {
    p_debate_id: debateId,
  });
}

export async function searchDebatersV15Action(
  query: string
): Promise<{ ok: boolean; profiles: DebateV15Profile[]; message?: string }> {
  const search = query.trim();
  if (search.length < 2) {
    return { ok: true, profiles: [] };
  }

  const supabase = await createClient();
  const escaped = search.replace(/[^\p{L}\p{N} -]/gu, "").trim();
  if (escaped.length < 2) {
    return { ok: true, profiles: [] };
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, university, avatar_url")
    .is("suspended_at", null)
    .or(`username.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
    .limit(8);

  if (error) return { ok: false, profiles: [], message: error.message };

  return {
    ok: true,
    profiles: (data ?? []).map((profile) => ({
      id: profile.id,
      username: profile.username,
      fullName: profile.full_name,
      university: profile.university,
      avatarUrl: profile.avatar_url,
    })),
  };
}
