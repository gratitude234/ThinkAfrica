"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  DebateV15ActionResult,
  DebateV15Profile,
  DebateV15Phase,
  DebateV15Stance,
} from "./types";

type RpcPayload = Record<string, string | number | boolean | object | null>;

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

async function runDebateRpc(
  debateId: string,
  name: string,
  payload: RpcPayload
): Promise<DebateV15ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, payload);

  if (error) return { ok: false, message: error.message };

  if (
    data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).outcome === "stale_no_op"
  ) {
    revalidatePath(`/debates/${debateId}`);
    return {
      ok: true,
      message:
        "This debate changed in another session. The latest state is now shown.",
    };
  }

  const resultError = rpcMessage(data);
  if (resultError) return { ok: false, message: resultError };

  revalidatePath(`/debates/${debateId}`);
  revalidatePath("/debates");
  return { ok: true };
}

export async function inviteDebaterV15Action(
  debateId: string,
  userId: string,
  stance: DebateV15Stance
) {
  return runDebateRpc(debateId, "invite_debater_v1_5", {
    p_debate_id: debateId,
    p_user_id: userId,
    p_stance: stance,
  });
}

export async function respondToDebateInvitationV15Action(
  debateId: string,
  accept: boolean
) {
  return runDebateRpc(debateId, "respond_to_debate_invitation_v1_5", {
    p_debate_id: debateId,
    p_accept: accept,
  });
}

export async function revokeDebateInvitationV15Action(
  debateId: string,
  stance: DebateV15Stance
) {
  return runDebateRpc(debateId, "revoke_debate_invitation_v1_5", {
    p_debate_id: debateId,
    p_stance: stance,
  });
}

export async function startDebateV15Action(debateId: string) {
  return runDebateRpc(debateId, "start_debate_v1_5", {
    p_debate_id: debateId,
    p_expected_phase: "recruiting",
  });
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
  return runDebateRpc(debateId, "advance_debate_phase_v1_5", {
    p_debate_id: debateId,
    p_expected_phase: expectedPhase,
  });
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
  return runDebateRpc(debateId, "cancel_debate_v1_5", {
    p_debate_id: debateId,
    p_reason: reason,
  });
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
