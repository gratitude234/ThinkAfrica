/**
 * Debate V2 Phase 1: additive data-foundation types.
 *
 * See docs/debate-v2-product-contract.md for the full product contract and
 * supabase/migrations/20260718000002_debate_v2_foundation.sql for the schema
 * this module mirrors.
 *
 * This is a pure type/constant layer over the new, currently-dormant Debate
 * V2 tables (debate_memberships, debate_rounds, debate_argument_sources,
 * debate_reactions, debate_ballots, debate_subscriptions,
 * debate_moderation_events) plus the additive debate_arguments columns.
 * Nothing here calls Supabase or performs a write -- Phase 1 introduces no
 * new RPC or write surface. It exists so later phases (and this phase's own
 * tests) have one source of truth for the schema's literal unions instead
 * of re-typing string literals ad hoc, and so the migration's key
 * constraints can be exercised by tests without a local Postgres harness.
 */

export type DebateFormatVersion = 1 | 2;

export type DebateMembershipRole = "moderator" | "debater" | "juror";
export type DebateStance = "for" | "against";

export type DebateRoundPhase =
  | "opening"
  | "rebuttal"
  | "cross_examination"
  | "closing"
  | "final_vote";

export type DebateRoundStatus = "scheduled" | "active" | "completed" | "cancelled";

export type DebateArgumentRelationType =
  | "supports"
  | "challenges"
  | "answers"
  | "clarifies";

export type DebateArgumentEntryType =
  | "opening"
  | "claim"
  | "rebuttal"
  | "answer"
  | "closing";

export type DebateReactionType =
  | "well_supported"
  | "strong_reasoning"
  | "clear"
  | "strong_rebuttal"
  | "fair_to_opposition"
  | "changed_my_mind"
  | "needs_evidence";

export type DebateBallotStage = "initial" | "final";
export type DebateBallotVote = "for" | "against" | "undecided";

export type DebateModerationTargetType =
  | "debate"
  | "membership"
  | "round"
  | "argument"
  | "source"
  | "reaction"
  | "ballot";

const DEBATE_MEMBERSHIP_ROLES: readonly DebateMembershipRole[] = [
  "moderator",
  "debater",
  "juror",
];
const DEBATE_STANCES: readonly DebateStance[] = ["for", "against"];
const DEBATE_ROUND_PHASES: readonly DebateRoundPhase[] = [
  "opening",
  "rebuttal",
  "cross_examination",
  "closing",
  "final_vote",
];
const DEBATE_ROUND_STATUSES: readonly DebateRoundStatus[] = [
  "scheduled",
  "active",
  "completed",
  "cancelled",
];
const DEBATE_ARGUMENT_RELATION_TYPES: readonly DebateArgumentRelationType[] = [
  "supports",
  "challenges",
  "answers",
  "clarifies",
];
const DEBATE_ARGUMENT_ENTRY_TYPES: readonly DebateArgumentEntryType[] = [
  "opening",
  "claim",
  "rebuttal",
  "answer",
  "closing",
];
const DEBATE_REACTION_TYPES: readonly DebateReactionType[] = [
  "well_supported",
  "strong_reasoning",
  "clear",
  "strong_rebuttal",
  "fair_to_opposition",
  "changed_my_mind",
  "needs_evidence",
];
const DEBATE_BALLOT_STAGES: readonly DebateBallotStage[] = ["initial", "final"];
const DEBATE_BALLOT_VOTES: readonly DebateBallotVote[] = ["for", "against", "undecided"];
const DEBATE_MODERATION_TARGET_TYPES: readonly DebateModerationTargetType[] = [
  "debate",
  "membership",
  "round",
  "argument",
  "source",
  "reaction",
  "ballot",
];

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isDebateMembershipRole(value: unknown): value is DebateMembershipRole {
  return includes(DEBATE_MEMBERSHIP_ROLES, value);
}

export function isDebateStance(value: unknown): value is DebateStance {
  return includes(DEBATE_STANCES, value);
}

export function isDebateRoundPhase(value: unknown): value is DebateRoundPhase {
  return includes(DEBATE_ROUND_PHASES, value);
}

export function isDebateRoundStatus(value: unknown): value is DebateRoundStatus {
  return includes(DEBATE_ROUND_STATUSES, value);
}

export function isDebateArgumentRelationType(
  value: unknown
): value is DebateArgumentRelationType {
  return includes(DEBATE_ARGUMENT_RELATION_TYPES, value);
}

export function isDebateArgumentEntryType(value: unknown): value is DebateArgumentEntryType {
  return includes(DEBATE_ARGUMENT_ENTRY_TYPES, value);
}

export function isDebateReactionType(value: unknown): value is DebateReactionType {
  return includes(DEBATE_REACTION_TYPES, value);
}

export function isDebateBallotStage(value: unknown): value is DebateBallotStage {
  return includes(DEBATE_BALLOT_STAGES, value);
}

export function isDebateBallotVote(value: unknown): value is DebateBallotVote {
  return includes(DEBATE_BALLOT_VOTES, value);
}

export function isDebateModerationTargetType(
  value: unknown
): value is DebateModerationTargetType {
  return includes(DEBATE_MODERATION_TARGET_TYPES, value);
}

/**
 * Mirrors the debate_memberships_stance_matches_role CHECK constraint: a
 * debater must have a stance, and every other role must not.
 */
export function isValidDebateMembership(
  role: DebateMembershipRole,
  stance: DebateStance | null
): boolean {
  if (role === "debater") return stance === "for" || stance === "against";
  return stance === null;
}

/** Mirrors the debate_rounds_ends_after_starts CHECK constraint. */
export function violatesRoundTiming(
  startsAt: string | null,
  endsAt: string | null
): boolean {
  if (startsAt === null || endsAt === null) return false;
  return new Date(endsAt).getTime() <= new Date(startsAt).getTime();
}

/** Mirrors the debate_rounds_one_active_per_debate partial unique index. */
export function violatesOneActiveRoundPerDebate(
  rounds: Array<{ debate_id: string; status: DebateRoundStatus }>
): boolean {
  const activeCounts = new Map<string, number>();
  for (const round of rounds) {
    if (round.status !== "active") continue;
    activeCounts.set(round.debate_id, (activeCounts.get(round.debate_id) ?? 0) + 1);
  }
  return [...activeCounts.values()].some((count) => count > 1);
}

export interface DebateMembershipRecord {
  debate_id: string;
  user_id: string;
  role: DebateMembershipRole;
  stance: DebateStance | null;
  joined_at: string;
}

/** One row shape shared by the Phase 1 backfill and the hardening-pass sync triggers. */
export function membershipFromParticipant(participant: {
  debate_id: string;
  user_id: string;
  stance: DebateStance;
  joined_at: string;
}): DebateMembershipRecord {
  return {
    debate_id: participant.debate_id,
    user_id: participant.user_id,
    role: "debater",
    stance: participant.stance,
    joined_at: participant.joined_at,
  };
}

/** Mirrors sync_debate_moderator_membership()'s NEW.moderator_id IS NOT NULL guard. */
export function membershipFromModerator(
  debate: { id: string; moderator_id: string | null; created_at: string }
): DebateMembershipRecord | null {
  if (debate.moderator_id === null) return null;
  return {
    debate_id: debate.id,
    user_id: debate.moderator_id,
    role: "moderator",
    stance: null,
    joined_at: debate.created_at,
  };
}

/**
 * Pure port of the Phase 1 backfill in
 * supabase/migrations/20260718000002_debate_v2_foundation.sql:
 *   - every debate_participants row becomes a `debater` membership carrying
 *     its existing stance and joined_at
 *   - every debates row with a non-null moderator_id becomes a `moderator`
 *     membership with a null stance, joined_at falling back to the debate's
 *     created_at
 * This repo has no local Postgres harness to execute the real INSERT
 * statements (see CLAUDE.md), so this port lets the backfill's shape run
 * under `npm run test`.
 */
export function backfillDebateMemberships(
  participants: Array<{
    debate_id: string;
    user_id: string;
    stance: DebateStance;
    joined_at: string;
  }>,
  debates: Array<{ id: string; moderator_id: string | null; created_at: string }>
): DebateMembershipRecord[] {
  const debaterRows = participants.map(membershipFromParticipant);
  const moderatorRows = debates
    .map(membershipFromModerator)
    .filter((row): row is DebateMembershipRecord => row !== null);

  return [...debaterRows, ...moderatorRows];
}

/**
 * Mirrors `ON CONFLICT (debate_id, user_id, role) DO NOTHING`: the first
 * row for a given key wins, later rows sharing the same key are dropped.
 * Used to verify the backfill stays conflict-safe if re-applied.
 */
export function dedupeDebateMembershipsByKey(
  rows: DebateMembershipRecord[]
): DebateMembershipRecord[] {
  const seen = new Set<string>();
  const result: DebateMembershipRecord[] = [];
  for (const row of rows) {
    const key = `${row.debate_id}:${row.user_id}:${row.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Hardening pass (see supabase/migrations/20260718000002_debate_v2_foundation.sql,
// sections A, B, D, and G): pure ports of the new triggers/constraints,
// exercised by lib/debateV2.test.ts in the absence of a local Postgres
// harness.
// ---------------------------------------------------------------------------

/**
 * Mirrors debate_arguments_parent_relation_pairing_check: parent_argument_id
 * and relation_type must be set together or not at all.
 */
export function violatesArgumentParentRelationPairing(
  parentArgumentId: string | null,
  relationType: DebateArgumentRelationType | null
): boolean {
  return (parentArgumentId === null) !== (relationType === null);
}

export type SameDebateCheckResult =
  | "not_referenced"
  | "not_found"
  | "different_debate"
  | "ok";

/**
 * Mirrors the shared shape of debate_arguments_check_same_debate() and
 * debate_ballots_check_same_debate(): given an optional referenced id, the
 * debate_id found by looking it up (or null/undefined if no such row
 * exists), and the referencing row's own debate_id, decide what the trigger
 * would do. Used for all three same-debate checks the hardening pass adds
 * (debate_arguments.round_id, debate_arguments.parent_argument_id,
 * debate_ballots.influential_argument_id) since the SQL logic is identical
 * for each.
 */
export function checkSameDebateReference(
  referencedId: string | null,
  referencedRowDebateId: string | null | undefined,
  ownDebateId: string
): SameDebateCheckResult {
  if (referencedId === null) return "not_referenced";
  if (referencedRowDebateId === null || referencedRowDebateId === undefined) {
    return "not_found";
  }
  if (referencedRowDebateId !== ownDebateId) return "different_debate";
  return "ok";
}

/** True when checkSameDebateReference would make the trigger RAISE EXCEPTION. */
export function violatesSameDebateReference(
  referencedId: string | null,
  referencedRowDebateId: string | null | undefined,
  ownDebateId: string
): boolean {
  const result = checkSameDebateReference(referencedId, referencedRowDebateId, ownDebateId);
  return result === "not_found" || result === "different_debate";
}

export type FormatVersionOperation = "INSERT" | "UPDATE";

/**
 * Mirrors debates_guard_format_version(): blocks an authenticated
 * (non-service-role) client from changing format_version in either
 * direction. TG_OP is modelled explicitly since INSERT has no OLD row to
 * compare against -- an authenticated INSERT is checked against the literal
 * value 1 (the column's own DEFAULT) instead, so a plain debate-creation
 * insert that never mentions format_version still passes. Every other JWT
 * role (service_role, or no role at all for direct SQL/migrations) is
 * unaffected.
 */
export function violatesFormatVersionGuard(
  op: FormatVersionOperation,
  requestRole: string | null,
  newFormatVersion: DebateFormatVersion,
  oldFormatVersion?: DebateFormatVersion
): boolean {
  if (requestRole !== "authenticated") return false;
  if (op === "INSERT") return newFormatVersion !== 1;
  return newFormatVersion !== oldFormatVersion;
}

/**
 * Correction pass: mirrors prevent_debate_id_change(), shared by
 * debate_rounds, debate_arguments, and debate_ballots -- debate_id is
 * immutable on all three after the row is created.
 */
export function violatesDebateIdImmutability(
  oldDebateId: string,
  newDebateId: string
): boolean {
  return newDebateId !== oldDebateId;
}

/**
 * Correction pass: mirrors debate_arguments_clear_relation_on_parent_null(),
 * which keeps debate_arguments_parent_relation_pairing_check satisfied when
 * parent_argument_id is cleared -- whether by its ON DELETE SET NULL FK
 * action (a parent argument being deleted) or by any future explicit
 * "detach from parent" update. Returns the relation_type the row should end
 * up with after the trigger runs.
 */
export function applyClearRelationOnParentNull(
  oldParentArgumentId: string | null,
  newParentArgumentId: string | null,
  newRelationType: DebateArgumentRelationType | null
): DebateArgumentRelationType | null {
  if (newParentArgumentId === null && oldParentArgumentId !== null) {
    return null;
  }
  return newRelationType;
}

// ---------------------------------------------------------------------------
// Phase 4A: debate_cross_exchanges (see
// supabase/migrations/20260721000002_debate_v2_cross_examination.sql)
// ---------------------------------------------------------------------------

/**
 * Mirrors debate_cross_exchanges_answer_pairing: answer and answered_at
 * must both be set or both be null -- an exchange cannot have an answer
 * text with no answered_at timestamp, or vice versa.
 */
export function violatesCrossExchangeAnswerPairing(
  answer: string | null,
  answeredAt: string | null
): boolean {
  return (answer === null) !== (answeredAt === null);
}

/** Mirrors debate_cross_exchanges_asker_not_target: an asker cannot target themselves. */
export function violatesCrossExchangeSelfTarget(askerId: string, targetId: string): boolean {
  return askerId === targetId;
}

/**
 * Mirrors debate_cross_exchanges_answer_immutable_once_set() (pre-apply
 * review, defense-in-depth addition): once an answer is non-null, no
 * update may change it to a different value. Setting a first answer (old
 * null -> new non-null) is always allowed; this only rejects changing an
 * *existing* non-null answer to something else. A no-op update (old value
 * written back unchanged) is not a violation either -- only a genuine
 * change is.
 */
export function violatesCrossExchangeAnswerImmutability(
  oldAnswer: string | null,
  newAnswer: string | null
): boolean {
  return oldAnswer !== null && newAnswer !== oldAnswer;
}

// ---------------------------------------------------------------------------
// Phase 4B: debate_subscriptions.is_subscribed and debate_notification_events
// (see supabase/migrations/20260721000003_debate_v2_subscriptions_notifications.sql)
// ---------------------------------------------------------------------------

/** Mirrors debate_notification_events.event_type's CHECK constraint. */
export type DebateNotificationEventType =
  | "round_change"
  | "final_vote_open"
  | "direct_response_question"
  | "direct_response_answer"
  | "direct_response_rebuttal"
  | "evidence_requested";

/** Mirrors debate_notification_events.status's CHECK constraint. */
export type DebateNotificationEventStatus = "pending" | "delivered" | "failed";

/** Mirrors the four new debate_v2_* values added to notifications.type's CHECK constraint. */
export type DebateV2NotificationType =
  | "debate_v2_round_change"
  | "debate_v2_final_vote"
  | "debate_v2_direct_response"
  | "debate_v2_evidence_requested";

const DEBATE_NOTIFICATION_EVENT_TYPES: readonly DebateNotificationEventType[] = [
  "round_change",
  "final_vote_open",
  "direct_response_question",
  "direct_response_answer",
  "direct_response_rebuttal",
  "evidence_requested",
];

export function isDebateNotificationEventType(value: unknown): value is DebateNotificationEventType {
  return includes(DEBATE_NOTIFICATION_EVENT_TYPES, value);
}
