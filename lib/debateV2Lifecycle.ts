/**
 * Debate V2 Phase 2: lifecycle, permission, and limit contracts.
 *
 * See docs/debate-v2-phase2-lifecycle.md for the full design and
 * supabase/migrations/20260718000003_debate_v2_lifecycle_permissions.sql for
 * the schema/RPCs this module mirrors.
 *
 * Pure functions only -- nothing here calls Supabase. It exists so the
 * lifecycle/permission/limit rules Phase 2 adds at the database layer can
 * be exercised by tests without a local Postgres harness (this repo has
 * none -- see CLAUDE.md), following the same pattern lib/debateV2.ts
 * established in Phase 1. These are CONTRACT tests: they verify this
 * module's own logic matches the SQL it mirrors by inspection, not that the
 * real triggers/RPCs execute correctly. Real transaction, RLS, trigger,
 * row-lock, and function-grant behaviour still requires verification
 * against a staging Postgres/Supabase environment.
 */

import type {
  DebateArgumentEntryType,
  DebateArgumentRelationType,
  DebateBallotVote,
  DebateFormatVersion,
  DebateNotificationEventStatus,
  DebateNotificationEventType,
  DebateRoundPhase,
  DebateRoundStatus,
  DebateStance,
  DebateV2NotificationType,
} from "@/lib/debateV2";

// ---------------------------------------------------------------------------
// Lifecycle: phase order and transitions
// ---------------------------------------------------------------------------

export const PHASE_ORDER_V2: readonly DebateRoundPhase[] = [
  "opening",
  "rebuttal",
  "cross_examination",
  "closing",
  "final_vote",
];

/** Mirrors advance_or_close_debate_round_v2()'s sequence_number + 1 lookup. */
export function nextPhaseV2(phase: DebateRoundPhase): DebateRoundPhase | null {
  const index = PHASE_ORDER_V2.indexOf(phase);
  if (index === -1 || index === PHASE_ORDER_V2.length - 1) return null;
  return PHASE_ORDER_V2[index + 1];
}

/** Mirrors advance_or_close_debate_round_v2()'s final_vote -> debate_completed branch. */
export function isLastPhaseV2(phase: DebateRoundPhase): boolean {
  return phase === "final_vote";
}

// ---------------------------------------------------------------------------
// Authorization: can_manage_debate_v2
// ---------------------------------------------------------------------------

export interface ManagerContext {
  actorId: string | null;
  isDebateModeratorId: boolean;
  hasModeratorMembership: boolean;
  isEditorOrAdmin: boolean;
}

/**
 * Mirrors can_manage_debate_v2(): a user may manage a V2 debate if they are
 * debates.moderator_id, a debate_memberships moderator, an editor, or an
 * admin. A null actorId (missing authentication) always fails, matching
 * "treat missing authentication as a failure."
 */
export function canManageDebateV2(ctx: ManagerContext): boolean {
  if (ctx.actorId === null) return false;
  return ctx.isDebateModeratorId || ctx.hasModeratorMembership || ctx.isEditorOrAdmin;
}

// ---------------------------------------------------------------------------
// Format-version activation contract (activate_debate_v2)
// ---------------------------------------------------------------------------

export interface ActivationPrecondition {
  formatVersion: DebateFormatVersion;
  status: "open" | "active" | "closed";
  existingArgumentCount: number;
  existingRoundCount: number;
}

export type ActivationDecision =
  | { outcome: "already_activated" }
  | { outcome: "rejected"; reason: string }
  | { outcome: "activate" };

/**
 * Mirrors activate_debate_v2()'s ordering: idempotent short-circuit first
 * (already format_version = 2), then the status/argument/round rejections,
 * in the same order the SQL checks them. Authorization (can_manage_debate_v2)
 * is intentionally NOT part of this function -- it is checked in SQL before
 * any of these business rules run, and is exercised separately via
 * canManageDebateV2 above.
 */
export function decideActivation(input: ActivationPrecondition): ActivationDecision {
  if (input.formatVersion === 2) {
    return { outcome: "already_activated" };
  }
  if (input.status !== "open") {
    return {
      outcome: "rejected",
      reason: `Only an open debate can be converted to Debate V2 (current status: ${input.status}).`,
    };
  }
  if (input.existingArgumentCount > 0) {
    return {
      outcome: "rejected",
      reason: `This debate already has ${input.existingArgumentCount} argument(s); activation would make lifecycle inference unsafe.`,
    };
  }
  if (input.existingRoundCount > 0) {
    return { outcome: "rejected", reason: "This debate already has debate_rounds rows; refusing to reseed." };
  }
  return { outcome: "activate" };
}

/** The five ordered rounds activate_debate_v2() seeds, in sequence order. */
export const SEEDED_ROUND_PHASES_V2: readonly DebateRoundPhase[] = PHASE_ORDER_V2;

// ---------------------------------------------------------------------------
// V1/V2 RPC routing contract
// ---------------------------------------------------------------------------

/**
 * Mirrors the guard every hardened V1 RPC (join_debate, cast_motion_vote,
 * toggle_debate_vote, start_debate, advance_debate_phase, close_debate) now
 * performs immediately after resolving format_version: reject a V2 debate
 * rather than silently routing it into V1 logic.
 */
export function violatesV1RpcOnV2Debate(formatVersion: DebateFormatVersion): boolean {
  return formatVersion === 2;
}

// ---------------------------------------------------------------------------
// Due-round decisions (advance_due_debate_rounds_v2)
// ---------------------------------------------------------------------------

export interface OpeningRoundDueInput {
  debateFormatVersion: DebateFormatVersion;
  debateStatus: "open" | "active" | "closed";
  roundSequenceNumber: number;
  roundStatus: DebateRoundStatus;
  startsAt: string | null;
  now: Date;
}

/** Mirrors advance_due_debate_rounds_v2()'s "Phase A" selection predicate. */
export function isOpeningRoundDue(input: OpeningRoundDueInput): boolean {
  return (
    input.debateFormatVersion === 2 &&
    input.debateStatus === "open" &&
    input.roundSequenceNumber === 1 &&
    input.roundStatus === "scheduled" &&
    input.startsAt !== null &&
    new Date(input.startsAt).getTime() <= input.now.getTime()
  );
}

export interface ActiveRoundDueInput {
  debateFormatVersion: DebateFormatVersion;
  debateStatus: "open" | "active" | "closed";
  roundStatus: DebateRoundStatus;
  endsAt: string | null;
  now: Date;
}

/** Mirrors advance_due_debate_rounds_v2()'s "Phase B" selection predicate. */
export function isActiveRoundDue(input: ActiveRoundDueInput): boolean {
  return (
    input.debateFormatVersion === 2 &&
    input.debateStatus === "active" &&
    input.roundStatus === "active" &&
    input.endsAt !== null &&
    new Date(input.endsAt).getTime() <= input.now.getTime()
  );
}

// ---------------------------------------------------------------------------
// Forced vs normal close (close_debate_v2)
// ---------------------------------------------------------------------------

/** Mirrors close_debate_v2()'s "a reason is required to force-close" check. */
export function violatesForceCloseReasonRequirement(force: boolean, reason: string | null): boolean {
  return force && (reason === null || reason.trim() === "");
}

export type ClosureKind = "completed" | "forced";

/** Mirrors close_debate_v2()'s v_closure_kind assignment. */
export function resolveClosureKind(force: boolean): ClosureKind {
  return force ? "forced" : "completed";
}

/** Mirrors close_debate_v2()'s "normal close requires final_vote active" check. */
export function canNormalCloseV2(finalVoteRoundStatus: DebateRoundStatus | null): boolean {
  return finalVoteRoundStatus === "active";
}

// ---------------------------------------------------------------------------
// Word counting
// ---------------------------------------------------------------------------

/**
 * Mirrors count_words_v2() exactly: trim, then split on runs of whitespace.
 * An empty/all-whitespace string is zero words. Not a natural-language
 * tokenizer -- "well-supported" counts as one word, "word." counts as one
 * word including the period. This is a documented whitespace-splitting
 * contract, kept identical between this function and the SQL helper (see
 * this module's test file for the paired contract test).
 */
export function countWordsV2(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Phase word limits and submission limits (submit_debate_argument_v2)
// ---------------------------------------------------------------------------

export type ArgumentEntryTypeV2 = Extract<DebateArgumentEntryType, "opening" | "rebuttal" | "closing">;

export const WORD_LIMITS_V2: Record<ArgumentEntryTypeV2, number> = {
  opening: 300,
  rebuttal: 200,
  closing: 150,
};

export const SUBMISSION_LIMITS_V2: Record<ArgumentEntryTypeV2, number> = {
  opening: 1,
  rebuttal: 2,
  closing: 1,
};

/** Mirrors submit_debate_argument_v2()'s "% word limit" check. */
export function violatesWordLimitV2(entryType: ArgumentEntryTypeV2, content: string): boolean {
  return countWordsV2(content) > WORD_LIMITS_V2[entryType];
}

/** Mirrors submit_debate_argument_v2()'s per-entry-type existing-count checks. */
export function violatesSubmissionLimitV2(entryType: ArgumentEntryTypeV2, existingCount: number): boolean {
  return existingCount >= SUBMISSION_LIMITS_V2[entryType];
}

// ---------------------------------------------------------------------------
// Argument phase rules (opening/closing pairing, rebuttal requirements)
// ---------------------------------------------------------------------------

/**
 * Mirrors submit_debate_argument_v2()'s opening/closing branches: neither
 * may carry a parent_argument_id or relation_type.
 */
export function violatesOpeningOrClosingPairing(
  parentArgumentId: string | null,
  relationType: DebateArgumentRelationType | null
): boolean {
  return parentArgumentId !== null || relationType !== null;
}

/** Mirrors submit_debate_argument_v2()'s rebuttal branch: both are required. */
export function violatesRebuttalRequiresParentAndRelation(
  parentArgumentId: string | null,
  relationType: DebateArgumentRelationType | null
): boolean {
  return parentArgumentId === null || relationType === null;
}

export interface RebuttalParentContext {
  parentDebateId: string;
  ownDebateId: string;
  parentAuthorId: string;
  callerUserId: string;
  parentRoundSequence: number | null;
  activeRoundSequence: number;
  parentStance: DebateStance;
  callerStance: DebateStance;
  relationType: DebateArgumentRelationType;
}

export type RebuttalParentViolation =
  | "different_debate"
  | "self_rebuttal"
  | "not_earlier_round"
  | "challenge_must_target_opposing_stance"
  | null;

/**
 * Mirrors submit_debate_argument_v2()'s rebuttal-branch parent validation,
 * checked in the same order as the SQL: different-debate, self-rebuttal,
 * round ordering, then the challenges-must-target-opposing-stance rule.
 * Only relation_type = 'challenges' is stance-constrained; supports/answers/
 * clarifies may legitimately target either stance.
 */
export function checkRebuttalParent(ctx: RebuttalParentContext): RebuttalParentViolation {
  if (ctx.parentDebateId !== ctx.ownDebateId) return "different_debate";
  if (ctx.parentAuthorId === ctx.callerUserId) return "self_rebuttal";
  if (ctx.parentRoundSequence === null || ctx.parentRoundSequence >= ctx.activeRoundSequence) {
    return "not_earlier_round";
  }
  if (ctx.relationType === "challenges" && ctx.parentStance === ctx.callerStance) {
    return "challenge_must_target_opposing_stance";
  }
  return null;
}

/** Mirrors submit_debate_argument_v2()'s cross_examination/final_vote rejection. */
export function violatesActiveRoundPhaseForSubmission(activePhase: DebateRoundPhase): boolean {
  return activePhase === "cross_examination" || activePhase === "final_vote";
}

/** Mirrors submit_debate_argument_v2()'s "entry_type does not match the active round phase" check. */
export function violatesEntryTypeMatchesActivePhase(
  entryType: ArgumentEntryTypeV2,
  activePhase: DebateRoundPhase
): boolean {
  return entryType !== activePhase;
}

// ---------------------------------------------------------------------------
// Ballot windows (cast_debate_ballot_v2)
// ---------------------------------------------------------------------------

/** Mirrors cast_debate_ballot_v2()'s initial-stage window: only while the debate is open. */
export function isInitialBallotWindowOpen(debateStatus: "open" | "active" | "closed"): boolean {
  return debateStatus === "open";
}

/** Mirrors cast_debate_ballot_v2()'s final-stage window: only while final_vote is active. */
export function isFinalBallotWindowOpen(finalVoteRoundStatus: DebateRoundStatus | null): boolean {
  return finalVoteRoundStatus === "active";
}

/** Mirrors cast_debate_ballot_v2()'s confidence requirement (required for every V2 ballot). */
export function violatesConfidenceRequirement(confidence: number | null): boolean {
  return confidence === null || confidence < 1 || confidence > 5;
}

/** Mirrors cast_debate_ballot_v2()'s "influential_argument_id only allowed on a final ballot" check. */
export function violatesInfluentialArgumentStageRule(
  stage: "initial" | "final",
  influentialArgumentId: string | null
): boolean {
  return influentialArgumentId !== null && stage !== "final";
}

// ---------------------------------------------------------------------------
// Aggregate ballot-result visibility (get_debate_ballot_results_v2)
// ---------------------------------------------------------------------------

export const MIN_CONFIDENCE_SAMPLE_V2 = 3;

/** Mirrors get_debate_ballot_results_v2()'s average_confidence null-until-sample-size rule. */
export function shouldExposeAverageConfidence(total: number): boolean {
  return total >= MIN_CONFIDENCE_SAMPLE_V2;
}

export interface BallotResultVisibilityInput {
  stage: "initial" | "final";
  debateStatus: "open" | "active" | "closed";
  isAuthenticated: boolean;
  userHasBallotInStage: boolean;
  stageEnded: boolean;
}

/**
 * Mirrors get_debate_ballot_results_v2()'s visibility gate: anonymous
 * callers only ever see final results once the debate is closed;
 * authenticated callers need either their own ballot in that stage, or the
 * stage to have ended.
 */
export function canViewBallotResults(input: BallotResultVisibilityInput): boolean {
  if (!input.isAuthenticated) {
    return input.stage === "final" && input.debateStatus === "closed";
  }
  return input.userHasBallotInStage || input.stageEnded;
}

/** Mirrors get_debate_ballot_results_v2()'s v_stage_ended computation for the initial stage. */
export function hasInitialStageEnded(debateStatus: "open" | "active" | "closed"): boolean {
  return debateStatus !== "open";
}

/** Mirrors get_debate_ballot_results_v2()'s v_stage_ended computation for the final stage. */
export function hasFinalStageEnded(
  debateStatus: "open" | "active" | "closed",
  finalVoteRoundStatus: DebateRoundStatus | null
): boolean {
  return debateStatus === "closed" || finalVoteRoundStatus === "completed" || finalVoteRoundStatus === "cancelled";
}

// ---------------------------------------------------------------------------
// Reaction rules (toggle_debate_reaction_v2)
// ---------------------------------------------------------------------------

/** Mirrors toggle_debate_reaction_v2()'s self-reaction rejection. */
export function violatesSelfReaction(argumentAuthorId: string, userId: string): boolean {
  return argumentAuthorId === userId;
}

/** Mirrors toggle_debate_reaction_v2()'s toggle semantics: reacting again removes it. */
export function resolveReactionToggle(currentlyReacted: boolean): { reacted: boolean } {
  return { reacted: !currentlyReacted };
}

// ---------------------------------------------------------------------------
// Closed-debate write rejection (shared by every V2 mutation)
// ---------------------------------------------------------------------------

/**
 * Mirrors the closed-debate check shared by join_debate_v2,
 * cast_debate_ballot_v2, toggle_debate_reaction_v2 (via status <> 'active'),
 * submit_debate_argument_v2 (via status <> 'active'), and the round
 * lifecycle RPCs: a closed V2 debate rejects every participation write.
 */
export function violatesClosedDebateWrite(debateStatus: "open" | "active" | "closed"): boolean {
  return debateStatus === "closed";
}

// ---------------------------------------------------------------------------
// V2 vote/stance validity
// ---------------------------------------------------------------------------

export function isValidBallotVote(value: unknown): value is DebateBallotVote {
  return value === "for" || value === "against" || value === "undecided";
}

export function isValidDebaterStance(value: unknown): value is DebateStance {
  return value === "for" || value === "against";
}

// ---------------------------------------------------------------------------
// join_debate_v2 role/stance rules
// ---------------------------------------------------------------------------

export type JoinRoleV2 = "debater" | "juror";

/** Mirrors join_debate_v2()'s "cannot self-assign this role" check -- only debater/juror are self-selectable. */
export function isSelfSelectableRoleV2(role: string): role is JoinRoleV2 {
  return role === "debater" || role === "juror";
}

/** Mirrors join_debate_v2()'s debater-lobby-only window. */
export function canJoinAsDebaterV2(debateStatus: "open" | "active" | "closed"): boolean {
  return debateStatus === "open";
}

/** Mirrors join_debate_v2()'s juror open-or-active window. */
export function canJoinAsJurorV2(debateStatus: "open" | "active" | "closed"): boolean {
  return debateStatus === "open" || debateStatus === "active";
}

/**
 * Mirrors join_debate_v2()'s "cannot change sides by calling the RPC again"
 * rule: a debater who already joined keeps their persisted stance
 * regardless of what they pass on a later call.
 */
export function resolveDebaterStanceOnJoin(
  existingStance: DebateStance | null,
  requestedStance: DebateStance
): DebateStance {
  return existingStance ?? requestedStance;
}

// ---------------------------------------------------------------------------
// Hardening pass (staging-review round): double-advance / round-skip
// prevention, moderator reassignment, suspension enforcement, and
// consistent lock ordering. See
// supabase/migrations/20260718000003_debate_v2_lifecycle_permissions.sql's
// "Correction" comments for the SQL side of each of these.
// ---------------------------------------------------------------------------

export type RoundAdvanceOutcome = "stale_no_op" | "not_due" | "proceed";

export interface RoundAdvanceDecisionInput {
  expectedRoundId: string | null;
  actualActiveRoundId: string;
  requireDue: boolean;
  actualEndsAt: string | null;
  now: Date;
}

/**
 * Mirrors advance_or_close_debate_round_v2()'s post-lock checks, in order:
 * a caller whose expected round no longer matches what is actually active
 * gets 'stale_no_op' (this is what stops a double-click or manual/cron
 * overlap from skipping straight past a round nobody saw complete); an
 * automatic caller (requireDue) whose round turns out not to actually be
 * due once locked (a concurrent extend_debate_round_v2 pushed ends_at out)
 * gets 'not_due'; otherwise the transition proceeds.
 */
export function decideRoundAdvance(input: RoundAdvanceDecisionInput): RoundAdvanceOutcome {
  if (input.expectedRoundId !== null && input.expectedRoundId !== input.actualActiveRoundId) {
    return "stale_no_op";
  }
  if (input.requireDue) {
    const endsAtMs = input.actualEndsAt === null ? null : new Date(input.actualEndsAt).getTime();
    if (endsAtMs === null || endsAtMs > input.now.getTime()) {
      return "not_due";
    }
  }
  return "proceed";
}

/**
 * Mirrors extend_debate_round_v2()'s compare-and-swap check. Correction:
 * round id alone is not sufficient -- extending a round never changes its
 * id, so two duplicate requests (a double-click, a client retry) would
 * both see the same "expected" round still active and both apply their own
 * extension, stacking. expectedEndsAt is the caller's last-observed
 * ends_at; only a call whose expectation still matches the round's CURRENT
 * ends_at is allowed through. The first of two duplicate calls succeeds and
 * advances ends_at; the second's expectation is now stale and is rejected.
 */
export function decideExtendRound(
  expectedRoundId: string,
  actualActiveRoundId: string,
  expectedEndsAt: string | null,
  actualEndsAt: string | null
): "stale_no_op" | "proceed" {
  if (expectedRoundId !== actualActiveRoundId) return "stale_no_op";
  if (expectedEndsAt !== actualEndsAt) return "stale_no_op";
  return "proceed";
}

export type StartRoundOneOutcome = "already_started" | "rejected_not_open" | "start";

/**
 * Mirrors start_debate_round_one_v2()'s CORRECTED check ordering: the
 * round's own idempotency check runs BEFORE the "debate must be open"
 * business rule. The original ordering had these reversed, so a repeated
 * start call made after the debate had already progressed to 'active'
 * raised an error instead of ever reaching the "already started" branch --
 * the function claimed to be idempotent but wasn't. This function's
 * ordering is the fix: check round status first.
 */
export function decideStartRoundOne(
  roundStatus: DebateRoundStatus,
  debateStatus: "open" | "active" | "closed"
): StartRoundOneOutcome {
  if (roundStatus !== "scheduled") return "already_started";
  if (debateStatus !== "open") return "rejected_not_open";
  return "start";
}

/**
 * Functions that must reject a suspended caller (mirrors is_suspended()
 * being called at the top of each, immediately after the auth.uid() check).
 * These are SECURITY DEFINER writes that bypass RLS's own suspension
 * checks entirely (posts/comments/debate_arguments/follows all gate on
 * is_suspended() at the RLS layer -- see
 * 20260704000001_trust_safety_v1.sql), so each must perform the check
 * itself rather than inheriting it "for free" the way a plain client insert
 * would. This constant exists so a test can assert the coverage explicitly
 * -- it does not by itself prove the SQL calls is_suspended(), which still
 * requires reading the migration or a staging Postgres check.
 */
export const SUSPENSION_GATED_FUNCTIONS_V2 = [
  "join_debate_v2",
  "cast_debate_ballot_v2",
  "toggle_debate_reaction_v2",
  "submit_debate_argument_v2",
  "submit_cross_examination_question_v2",
  "submit_cross_examination_answer_v2",
] as const;

export interface ModeratorMembershipSyncInput {
  debateId: string;
  oldModeratorId: string | null;
  newModeratorId: string | null;
}

export interface ModeratorMembershipSyncResult {
  removeUserId: string | null;
  addUserId: string | null;
}

/**
 * Mirrors the corrected sync_debate_moderator_membership() trigger: on a
 * moderator_id change, the FORMER moderator's debate_memberships row is
 * removed before the new one is added, so a former moderator can never
 * keep passing can_manage_debate_v2()'s membership-based check through a
 * stale row. Phase 2's explicit semantics: single moderator --
 * debate_memberships' moderator row is a synchronized mirror of
 * debates.moderator_id, never an independently-granted co-moderator (that
 * is out of scope, deferred to a future phase with its own grant/revoke
 * RPC).
 */
export function resolveModeratorMembershipSync(
  input: ModeratorMembershipSyncInput
): ModeratorMembershipSyncResult {
  const removeUserId =
    input.oldModeratorId !== null && input.oldModeratorId !== input.newModeratorId
      ? input.oldModeratorId
      : null;
  const addUserId = input.newModeratorId;
  return { removeUserId, addUserId };
}

// ---------------------------------------------------------------------------
// Second hardening pass: cron batch counting must not conflate a genuine
// transition with a no-op it now knows how to detect.
// ---------------------------------------------------------------------------

/**
 * Mirrors advance_due_debate_rounds_v2()'s Phase A classification.
 * Correction: the batch previously discarded start_debate_round_one_v2's
 * return value via PERFORM and always incremented `started`, so an
 * idempotent no-op (the round was already started by the time this call's
 * lock was granted) was silently counted as a fresh start. The batch now
 * captures the JSON result and classifies it: already_started -> skipped.
 */
export function classifyStartRoundOutcome(alreadyStarted: boolean): "started" | "skipped" {
  return alreadyStarted ? "skipped" : "started";
}

/**
 * Mirrors advance_due_debate_rounds_v2()'s Phase B classification.
 * Correction: same issue as Phase A, but for
 * advance_or_close_debate_round_v2, which can return 'stale_no_op' (another
 * caller already moved the round on) or 'not_due' (a concurrent extension
 * pushed ends_at out) in addition to actually transitioning. Only
 * 'round_advanced'/'debate_completed' count as a real advance.
 */
export function classifyAdvanceRoundOutcome(result: string): "advanced" | "skipped" {
  return result === "round_advanced" || result === "debate_completed" ? "advanced" : "skipped";
}

// ---------------------------------------------------------------------------
// Phase 4A: structured cross-examination
// (submit_cross_examination_question_v2 / submit_cross_examination_answer_v2,
// supabase/migrations/20260721000002_debate_v2_cross_examination.sql)
// ---------------------------------------------------------------------------

export const CROSS_EXAM_QUESTION_WORD_LIMIT = 60;
export const CROSS_EXAM_ANSWER_WORD_LIMIT = 120;
export const CROSS_EXAM_MAX_QUESTIONS_PER_ASKER = 2;

/** Mirrors submit_cross_examination_question_v2()'s question word-limit check. */
export function violatesCrossExamQuestionWordLimit(question: string): boolean {
  return countWordsV2(question) > CROSS_EXAM_QUESTION_WORD_LIMIT;
}

/** Mirrors submit_cross_examination_answer_v2()'s answer word-limit check. */
export function violatesCrossExamAnswerWordLimit(answer: string): boolean {
  return countWordsV2(answer) > CROSS_EXAM_ANSWER_WORD_LIMIT;
}

/** Mirrors submit_cross_examination_question_v2()'s "at most 2 questions per asker" check. */
export function violatesCrossExamQuestionAllowance(existingCount: number): boolean {
  return existingCount >= CROSS_EXAM_MAX_QUESTIONS_PER_ASKER;
}

/** How many more questions this asker may still submit, for UI display -- never negative. */
export function remainingCrossExamQuestions(existingCount: number): number {
  return Math.max(0, CROSS_EXAM_MAX_QUESTIONS_PER_ASKER - existingCount);
}

export interface CrossExamQuestionEligibilityInput {
  debateStatus: "open" | "active" | "closed";
  activeRoundPhase: DebateRoundPhase | null;
  callerIsDebater: boolean;
  existingQuestionCount: number;
}

export type CrossExamQuestionEligibility =
  | "eligible"
  | "debate_not_active"
  | "wrong_phase"
  | "not_a_debater"
  | "allowance_exhausted";

/**
 * Mirrors submit_cross_examination_question_v2()'s gating checks, in the
 * order the RPC encounters them, so the UI can decide which form/message to
 * show. SQL remains authoritative -- this never replaces the RPC's own
 * re-validation under lock.
 */
export function checkCrossExamQuestionEligibility(
  input: CrossExamQuestionEligibilityInput
): CrossExamQuestionEligibility {
  if (input.debateStatus !== "active") return "debate_not_active";
  if (input.activeRoundPhase !== "cross_examination") return "wrong_phase";
  if (!input.callerIsDebater) return "not_a_debater";
  if (violatesCrossExamQuestionAllowance(input.existingQuestionCount)) return "allowance_exhausted";
  return "eligible";
}

export interface CrossExamTargetContext {
  targetUserId: string;
  callerUserId: string;
  targetStance: DebateStance | null;
  callerStance: DebateStance;
}

export type CrossExamTargetViolation = "self_target" | "not_a_debater" | "same_stance" | null;

/** Mirrors submit_cross_examination_question_v2()'s target validation, in order. */
export function checkCrossExamTarget(ctx: CrossExamTargetContext): CrossExamTargetViolation {
  if (ctx.targetUserId === ctx.callerUserId) return "self_target";
  if (ctx.targetStance === null) return "not_a_debater";
  if (ctx.targetStance === ctx.callerStance) return "same_stance";
  return null;
}

export interface CrossExamTargetArgumentContext {
  argumentDebateId: string | null;
  ownDebateId: string;
  argumentAuthorId: string | null;
  targetUserId: string;
  argumentRoundSequence: number | null;
  activeRoundSequence: number;
}

export type CrossExamTargetArgumentViolation =
  | "not_found"
  | "different_debate"
  | "not_authored_by_target"
  | "not_earlier_round"
  | null;

/** Mirrors submit_cross_examination_question_v2()'s optional target_argument_id validation, in order. */
export function checkCrossExamTargetArgument(
  ctx: CrossExamTargetArgumentContext
): CrossExamTargetArgumentViolation {
  if (ctx.argumentDebateId === null) return "not_found";
  if (ctx.argumentDebateId !== ctx.ownDebateId) return "different_debate";
  if (ctx.argumentAuthorId !== ctx.targetUserId) return "not_authored_by_target";
  if (ctx.argumentRoundSequence === null || ctx.argumentRoundSequence >= ctx.activeRoundSequence) {
    return "not_earlier_round";
  }
  return null;
}

export interface CrossExamAnswerEligibilityInput {
  debateStatus: "open" | "active" | "closed";
  activeRoundPhase: DebateRoundPhase | null;
  exchangeRoundId: string;
  activeRoundId: string | null;
  targetId: string;
  callerUserId: string | null;
  alreadyAnswered: boolean;
}

export type CrossExamAnswerEligibility =
  | "eligible"
  | "not_authenticated"
  | "debate_not_active"
  | "wrong_phase"
  | "round_no_longer_active"
  | "not_the_target"
  | "already_answered";

/**
 * Mirrors submit_cross_examination_answer_v2()'s gating checks, in order.
 * Correction (pre-apply review): the RPC's own order was fixed so that
 * identity/authorization (who is calling, are they the exchange's target)
 * and the idempotent already-answered short-circuit are resolved BEFORE
 * any debate/round timing check -- a retried call for a question that was
 * already successfully answered must return "already_answered" regardless
 * of what has happened to the debate/round since, not a timing error. Only
 * a genuinely new (not-yet-answered) answer attempt needs the debate to be
 * active and the cross-examination round to still be this exchange's own
 * active round. This function's branch order was updated to match.
 */
export function checkCrossExamAnswerEligibility(
  input: CrossExamAnswerEligibilityInput
): CrossExamAnswerEligibility {
  if (input.callerUserId === null) return "not_authenticated";
  if (input.targetId !== input.callerUserId) return "not_the_target";
  if (input.alreadyAnswered) return "already_answered";
  if (input.debateStatus !== "active") return "debate_not_active";
  if (input.activeRoundPhase !== "cross_examination") return "wrong_phase";
  if (input.exchangeRoundId !== input.activeRoundId) return "round_no_longer_active";
  return "eligible";
}

// ---------------------------------------------------------------------------
// Cross-examination display state -- derived, never stored (no status
// column on debate_cross_exchanges; see that table's migration comment)
// ---------------------------------------------------------------------------

export type CrossExchangeDisplayStatus = "answered" | "awaiting_answer" | "expired_unanswered";

/**
 * Mirrors the product contract's "unanswered questions remain visible after
 * the round and are labelled unanswered/expired; they cannot be answered
 * later" rule. Derives display status purely from answer presence plus
 * whether the exchange's own round is still the debate's active
 * cross-examination round -- exactly the same condition
 * submit_cross_examination_answer_v2 checks server-side before allowing an
 * answer, so this label and the RPC's own acceptance can never disagree.
 */
export function deriveCrossExchangeStatus(input: {
  hasAnswer: boolean;
  exchangeRoundId: string;
  activeRoundId: string | null;
  activeRoundPhase: DebateRoundPhase | null;
}): CrossExchangeDisplayStatus {
  if (input.hasAnswer) return "answered";
  const roundStillActive =
    input.activeRoundId === input.exchangeRoundId && input.activeRoundPhase === "cross_examination";
  return roundStillActive ? "awaiting_answer" : "expired_unanswered";
}

// ---------------------------------------------------------------------------
// Phase 4B: subscriptions and notification events (see
// supabase/migrations/20260721000003_debate_v2_subscriptions_notifications.sql)
// ---------------------------------------------------------------------------

export interface DebateSubscriptionRow {
  isSubscribed: boolean;
  notifyPhaseChanges: boolean;
  notifyDirectResponses: boolean;
  notifyEvidenceRequests: boolean;
  notifyFinalVote: boolean;
  notifyRecap: boolean;
}

/** debate_subscriptions' own column defaults -- every value true. */
export const DEFAULT_DEBATE_SUBSCRIPTION_ROW: DebateSubscriptionRow = {
  isSubscribed: true,
  notifyPhaseChanges: true,
  notifyDirectResponses: true,
  notifyEvidenceRequests: true,
  notifyFinalVote: true,
  notifyRecap: true,
};

export interface SetDebateSubscriptionInput {
  isSubscribed: boolean;
  notifyPhaseChanges?: boolean | null;
  notifyDirectResponses?: boolean | null;
  notifyEvidenceRequests?: boolean | null;
  notifyFinalVote?: boolean | null;
  notifyRecap?: boolean | null;
}

/**
 * Mirrors set_debate_subscription_v2()'s INSERT ... ON CONFLICT DO UPDATE:
 * is_subscribed is always the caller-supplied value (never preserved/
 * defaulted); each of the five notify_* fields falls back to the existing
 * row's own value when omitted (null/undefined), or to the table's default
 * (true) when there is no existing row yet (first-ever subscribe).
 */
export function resolveSubscriptionUpsert(
  existing: DebateSubscriptionRow | null,
  input: SetDebateSubscriptionInput
): DebateSubscriptionRow {
  const base = existing ?? DEFAULT_DEBATE_SUBSCRIPTION_ROW;
  return {
    isSubscribed: input.isSubscribed,
    notifyPhaseChanges: input.notifyPhaseChanges ?? base.notifyPhaseChanges,
    notifyDirectResponses: input.notifyDirectResponses ?? base.notifyDirectResponses,
    notifyEvidenceRequests: input.notifyEvidenceRequests ?? base.notifyEvidenceRequests,
    notifyFinalVote: input.notifyFinalVote ?? base.notifyFinalVote,
    notifyRecap: input.notifyRecap ?? base.notifyRecap,
  };
}

/**
 * Mirrors ensure_debate_subscription_default_v2()'s INSERT ... ON CONFLICT
 * DO NOTHING: an existing row -- subscribed or explicitly opted out -- is
 * returned completely unchanged; only a genuinely missing row is created,
 * and always with the table's own defaults (fully subscribed). This is the
 * entire durable/opt-out-safe guarantee: there is no branch here that can
 * ever flip an existing row's isSubscribed back to true.
 */
export function applyAutoSubscribeDefault(existing: DebateSubscriptionRow | null): DebateSubscriptionRow {
  return existing ?? DEFAULT_DEBATE_SUBSCRIPTION_ROW;
}

/**
 * The participation RPCs that call ensure_debate_subscription_default_v2,
 * chosen and documented in the migration's own section 5 comment:
 * join_debate_v2 (debater or juror -- the explicit minimum bar) and
 * cast_debate_ballot_v2 (a ballot can be cast without ever having joined).
 * submit_debate_argument_v2/submit_cross_examination_question_v2/
 * submit_cross_examination_answer_v2 all require an existing debater
 * membership already, so join_debate_v2's own hook has always already run
 * by the time any of them can succeed. toggle_debate_reaction_v2 requires no
 * membership and is judged too low-intent (a single click) to auto-subscribe.
 */
export const HIGH_INTENT_AUTO_SUBSCRIBE_FUNCTIONS_V2 = ["join_debate_v2", "cast_debate_ballot_v2"] as const;

// ---------------------------------------------------------------------------
// Event keys -- must stay byte-for-byte identical to each emission call
// site in the Phase 4B migration for the deduplication guarantee to hold.
// ---------------------------------------------------------------------------

export function roundChangeEventKey(debateId: string, roundId: string): string {
  return `${debateId}:round:${roundId}:active`;
}

export function finalVoteOpenEventKey(debateId: string, roundId: string): string {
  return `${debateId}:final_vote:${roundId}`;
}

export function crossExamQuestionEventKey(debateId: string, exchangeId: string): string {
  return `${debateId}:cross_question:${exchangeId}`;
}

export function crossExamAnswerEventKey(debateId: string, exchangeId: string): string {
  return `${debateId}:cross_answer:${exchangeId}`;
}

export function rebuttalEventKey(debateId: string, argumentId: string): string {
  return `${debateId}:rebuttal:${argumentId}`;
}

export function evidenceRequestedEventKey(debateId: string, argumentId: string): string {
  return `${debateId}:evidence:${argumentId}`;
}

/**
 * Mirrors advance_or_close_debate_round_v2()'s choice between a dedicated
 * final_vote_open event and a generic round_change event -- never both.
 */
export function resolveRoundTransitionEventType(
  nextPhase: DebateRoundPhase
): Extract<DebateNotificationEventType, "round_change" | "final_vote_open"> {
  return nextPhase === "final_vote" ? "final_vote_open" : "round_change";
}

/**
 * Mirrors the notifications.type each emission call site assigns for its
 * event_type -- the three direct-response sub-events collapse into one
 * shared notifications.type (see the migration's section 3 comment for why).
 */
export function debateNotificationTypeFor(eventType: DebateNotificationEventType): DebateV2NotificationType {
  switch (eventType) {
    case "round_change":
      return "debate_v2_round_change";
    case "final_vote_open":
      return "debate_v2_final_vote";
    case "direct_response_question":
    case "direct_response_answer":
    case "direct_response_rebuttal":
      return "debate_v2_direct_response";
    case "evidence_requested":
      return "debate_v2_evidence_requested";
  }
}

// ---------------------------------------------------------------------------
// Delivery worker: process_debate_notification_events_v2
// ---------------------------------------------------------------------------

/** Mirrors the worker's v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) bounding. */
export function clampNotificationWorkerLimit(limit: number | null | undefined): number {
  const value = limit ?? 50;
  return Math.min(Math.max(value, 1), 200);
}

export const NOTIFICATION_EVENT_MAX_ATTEMPTS = 5;

/**
 * Mirrors the worker's claiming predicate: `status = 'pending' OR (status =
 * 'failed' AND attempts < v_max_attempts)`. A 'delivered' event, or a
 * 'failed' event that has exhausted its attempts, is never eligible again
 * (dead-lettered).
 */
export function isNotificationEventEligibleForProcessing(event: {
  status: DebateNotificationEventStatus;
  attempts: number;
}): boolean {
  if (event.status === "pending") return true;
  if (event.status === "failed") return event.attempts < NOTIFICATION_EVENT_MAX_ATTEMPTS;
  return false;
}

/**
 * Mirrors the worker's per-recipient eligibility check, shared by both the
 * direct-event and broadcast-event branches: a recipient must have an
 * existing, isSubscribed row AND the specific preference for this event's
 * category enabled. No row at all (never subscribed) is never eligible --
 * there is no "default to notified" fallback anywhere in delivery.
 */
export function isEligibleForDebateNotification(input: {
  subscription: DebateSubscriptionRow | null;
  eventType: DebateNotificationEventType;
}): boolean {
  const { subscription, eventType } = input;
  if (!subscription || !subscription.isSubscribed) return false;

  switch (eventType) {
    case "round_change":
      return subscription.notifyPhaseChanges;
    case "final_vote_open":
      return subscription.notifyFinalVote;
    case "direct_response_question":
    case "direct_response_answer":
    case "direct_response_rebuttal":
      return subscription.notifyDirectResponses;
    case "evidence_requested":
      return subscription.notifyEvidenceRequests;
  }
}

/**
 * Mirrors the worker's broadcast-branch recipient filter, which additionally
 * excludes the event's own actor (round_change/final_vote_open only -- the
 * only two event types ever delivered as a broadcast).
 */
export function isEligibleBroadcastRecipient(input: {
  subscription: DebateSubscriptionRow | null;
  eventType: Extract<DebateNotificationEventType, "round_change" | "final_vote_open">;
  recipientUserId: string;
  actorId: string | null;
}): boolean {
  if (input.actorId !== null && input.recipientUserId === input.actorId) return false;
  return isEligibleForDebateNotification({ subscription: input.subscription, eventType: input.eventType });
}
