"use server";

/**
 * Debate V2 Phase 3: every V2 write goes through exactly one of these
 * actions, which call exactly one Phase 2 RPC each -- never a direct table
 * insert/update. See docs/debate-v2-phase2-lifecycle.md for each RPC's
 * full contract; this file only adapts client input <-> RPC args and
 * sanitizes errors, it does not re-implement any business rule the
 * database already enforces authoritatively.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeRpcErrorMessage } from "@/lib/debateV2Ui";
import type {
  DebateArgumentEntryType,
  DebateArgumentRelationType,
  DebateBallotVote,
  DebateReactionType,
  DebateStance,
} from "@/lib/debateV2";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function callRpc<T>(
  fnName: string,
  args: Record<string, unknown>
): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fnName, args);

  if (error) {
    return { ok: false, error: sanitizeRpcErrorMessage(error) };
  }

  return { ok: true, data: data as T };
}

function revalidateDebate(debateId: string) {
  revalidatePath(`/debates/${debateId}`);
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export interface JoinDebateV2Result {
  role: "debater" | "juror";
  stance: DebateStance | null;
  already_joined: boolean;
}

export async function joinDebateV2Action(
  debateId: string,
  role: "debater" | "juror",
  stance?: DebateStance | null
): Promise<ActionResult<JoinDebateV2Result>> {
  const result = await callRpc<JoinDebateV2Result>("join_debate_v2", {
    p_debate_id: debateId,
    p_role: role,
    p_stance: stance ?? null,
  });
  if (result.ok) revalidateDebate(debateId);
  return result;
}

// ---------------------------------------------------------------------------
// Ballots
// ---------------------------------------------------------------------------

export interface CastBallotV2Result {
  ballot_id: string;
  debate_id: string;
  stage: "initial" | "final";
  vote: DebateBallotVote;
  confidence: number;
}

export async function castDebateBallotV2Action(input: {
  debateId: string;
  stage: "initial" | "final";
  vote: DebateBallotVote;
  confidence: number;
  reason?: string | null;
  influentialArgumentId?: string | null;
}): Promise<ActionResult<CastBallotV2Result>> {
  const result = await callRpc<CastBallotV2Result>("cast_debate_ballot_v2", {
    p_debate_id: input.debateId,
    p_stage: input.stage,
    p_vote: input.vote,
    p_confidence: input.confidence,
    p_reason: input.reason?.trim() || null,
    p_influential_argument_id: input.stage === "final" ? (input.influentialArgumentId ?? null) : null,
  });
  if (result.ok) revalidateDebate(input.debateId);
  return result;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

export interface DebateV2SourceInput {
  url: string;
  title?: string | null;
  publisher?: string | null;
  published_at?: string | null;
  quoted_text?: string | null;
}

export interface SubmitArgumentV2Result {
  argument_id: string;
  debate_id: string;
  round_id: string;
  round_number: number;
  stance: DebateStance;
  entry_type: DebateArgumentEntryType;
  source_count: number;
}

export async function submitDebateArgumentV2Action(input: {
  debateId: string;
  claim: string;
  content: string;
  entryType: DebateArgumentEntryType;
  parentArgumentId?: string | null;
  relationType?: DebateArgumentRelationType | null;
  sources: DebateV2SourceInput[];
}): Promise<ActionResult<SubmitArgumentV2Result>> {
  const result = await callRpc<SubmitArgumentV2Result>("submit_debate_argument_v2", {
    p_debate_id: input.debateId,
    p_claim: input.claim,
    p_content: input.content,
    p_entry_type: input.entryType,
    p_parent_argument_id: input.parentArgumentId ?? null,
    p_relation_type: input.relationType ?? null,
    p_sources: input.sources,
  });
  if (result.ok) revalidateDebate(input.debateId);
  return result;
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

export interface ToggleReactionV2Result {
  argument_id: string;
  reacted: boolean;
  reaction_type: DebateReactionType;
  counts: Partial<Record<DebateReactionType, number>>;
}

export async function toggleDebateReactionV2Action(
  debateId: string,
  argumentId: string,
  reactionType: DebateReactionType
): Promise<ActionResult<ToggleReactionV2Result>> {
  const result = await callRpc<ToggleReactionV2Result>("toggle_debate_reaction_v2", {
    p_argument_id: argumentId,
    p_reaction_type: reactionType,
  });
  if (result.ok) revalidateDebate(debateId);
  return result;
}

// ---------------------------------------------------------------------------
// Cross-examination (Phase 4A)
// ---------------------------------------------------------------------------

export interface SubmitCrossExamQuestionV2Result {
  exchange_id: string;
  debate_id: string;
  round_id: string;
  target_id: string;
  target_argument_id: string | null;
}

export async function submitCrossExaminationQuestionV2Action(input: {
  debateId: string;
  targetUserId: string;
  question: string;
  targetArgumentId?: string | null;
}): Promise<ActionResult<SubmitCrossExamQuestionV2Result>> {
  const result = await callRpc<SubmitCrossExamQuestionV2Result>("submit_cross_examination_question_v2", {
    p_debate_id: input.debateId,
    p_target_user_id: input.targetUserId,
    p_question: input.question,
    p_target_argument_id: input.targetArgumentId ?? null,
  });
  if (result.ok) revalidateDebate(input.debateId);
  return result;
}

export interface SubmitCrossExamAnswerV2Result {
  exchange_id: string;
  debate_id: string;
  already_answered: boolean;
}

export async function submitCrossExaminationAnswerV2Action(input: {
  debateId: string;
  exchangeId: string;
  answer: string;
}): Promise<ActionResult<SubmitCrossExamAnswerV2Result>> {
  const result = await callRpc<SubmitCrossExamAnswerV2Result>("submit_cross_examination_answer_v2", {
    p_debate_id: input.debateId,
    p_exchange_id: input.exchangeId,
    p_answer: input.answer,
  });
  if (result.ok) revalidateDebate(input.debateId);
  return result;
}

// ---------------------------------------------------------------------------
// Subscriptions (Phase 4B)
// ---------------------------------------------------------------------------

export interface SetDebateSubscriptionV2Result {
  debate_id: string;
  is_subscribed: boolean;
  notify_phase_changes: boolean;
  notify_direct_responses: boolean;
  notify_evidence_requests: boolean;
  notify_final_vote: boolean;
  notify_recap: boolean;
}

export async function setDebateSubscriptionV2Action(input: {
  debateId: string;
  isSubscribed: boolean;
  notifyPhaseChanges?: boolean | null;
  notifyDirectResponses?: boolean | null;
  notifyEvidenceRequests?: boolean | null;
  notifyFinalVote?: boolean | null;
  notifyRecap?: boolean | null;
}): Promise<ActionResult<SetDebateSubscriptionV2Result>> {
  // Deliberately no revalidateDebate() call here, unlike every other action
  // in this file -- subscription state is caller-private and never affects
  // what any other viewer of this room sees, so a full room revalidate
  // would be a wasted reload. The subscription control updates itself
  // directly from this action's own returned data (see
  // V2SubscriptionControl.tsx) -- "do not reload the entire room merely to
  // update local subscription preferences."
  return callRpc<SetDebateSubscriptionV2Result>("set_debate_subscription_v2", {
    p_debate_id: input.debateId,
    p_is_subscribed: input.isSubscribed,
    p_notify_phase_changes: input.notifyPhaseChanges ?? null,
    p_notify_direct_responses: input.notifyDirectResponses ?? null,
    p_notify_evidence_requests: input.notifyEvidenceRequests ?? null,
    p_notify_final_vote: input.notifyFinalVote ?? null,
    p_notify_recap: input.notifyRecap ?? null,
  });
}

// ---------------------------------------------------------------------------
// Round lifecycle (manager-only; can_manage_debate_v2 is re-checked
// authoritatively inside every one of these RPCs regardless of what the
// client believes)
// ---------------------------------------------------------------------------

export async function startDebateV2Action(debateId: string): Promise<ActionResult<Record<string, unknown>>> {
  const result = await callRpc<Record<string, unknown>>("start_debate_v2", { p_debate_id: debateId });
  if (result.ok) revalidateDebate(debateId);
  return result;
}

export async function advanceDebateRoundV2Action(
  debateId: string,
  expectedRoundId: string
): Promise<ActionResult<Record<string, unknown>>> {
  const result = await callRpc<Record<string, unknown>>("advance_debate_round_v2", {
    p_debate_id: debateId,
    p_expected_round_id: expectedRoundId,
  });
  if (result.ok) revalidateDebate(debateId);
  return result;
}

export async function extendDebateRoundV2Action(
  debateId: string,
  expectedRoundId: string,
  expectedEndsAt: string | null,
  minutes: number
): Promise<ActionResult<Record<string, unknown>>> {
  const result = await callRpc<Record<string, unknown>>("extend_debate_round_v2", {
    p_debate_id: debateId,
    p_expected_round_id: expectedRoundId,
    p_expected_ends_at: expectedEndsAt,
    p_minutes: minutes,
  });
  if (result.ok) revalidateDebate(debateId);
  return result;
}

export async function closeDebateV2Action(
  debateId: string,
  force: boolean,
  reason?: string | null
): Promise<ActionResult<Record<string, unknown>>> {
  const result = await callRpc<Record<string, unknown>>("close_debate_v2", {
    p_debate_id: debateId,
    p_force: force,
    p_reason: reason?.trim() || null,
  });
  if (result.ok) revalidateDebate(debateId);
  return result;
}

// ---------------------------------------------------------------------------
// Activation (service-role only)
// ---------------------------------------------------------------------------
// activate_debate_v2 is granted to service_role alone (Phase 2). This action
// is the ONLY place in the app that may call it: it authenticates the
// caller with the normal user-scoped server client, derives p_actor_id from
// that session (never from client input), and only then uses the
// server-only admin client to make the privileged call. The admin client's
// module is `import "server-only"`, and this whole file is a Server Action
// module -- neither the service-role key nor this function's code is ever
// sent to the browser. activate_debate_v2 performs its own authoritative
// can_manage_debate_v2 check on p_actor_id; this action does not attempt to
// duplicate that check client-side as anything more than a UX convenience.
export async function activateDebateV2Action(
  debateId: string,
  openingStartsAt?: string | null
): Promise<ActionResult<Record<string, unknown>>> {
  // Mirrors the page.tsx render-time gate -- checked again here so this
  // action refuses the call even if that gate were ever bypassed (a direct
  // call, a stale client bundle, etc). See page.tsx's activation comment
  // for why this is still off by default: staging concurrency/grant
  // verification and cron scheduling remain open deployment gates.
  if (process.env.DEBATE_V2_ACTIVATION_ENABLED !== "1") {
    return { ok: false, error: "Debate V2 activation is not yet enabled." };
  }

  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("activate_debate_v2", {
    p_debate_id: debateId,
    p_actor_id: user.id,
    p_opening_starts_at: openingStartsAt ?? null,
  });

  if (error) {
    return { ok: false, error: sanitizeRpcErrorMessage(error) };
  }

  revalidateDebate(debateId);
  return { ok: true, data: data as Record<string, unknown> };
}
