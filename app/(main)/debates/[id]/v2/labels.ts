/**
 * Debate V2 Phase 3: centralized human-readable labels for every V2 literal
 * union, so no component re-types the same string union or invents its own
 * copy of these labels.
 */

import type {
  DebateArgumentEntryType,
  DebateArgumentRelationType,
  DebateReactionType,
  DebateRoundPhase,
  DebateRoundStatus,
} from "@/lib/debateV2";
import type { CrossExchangeDisplayStatus } from "@/lib/debateV2Lifecycle";

export const ROUND_PHASE_LABELS: Record<DebateRoundPhase, string> = {
  opening: "Opening Statements",
  rebuttal: "Rebuttal",
  cross_examination: "Cross-Examination",
  closing: "Closing Statements",
  final_vote: "Final Vote",
};

export const ROUND_PHASE_SHORT_LABELS: Record<DebateRoundPhase, string> = {
  opening: "Opening",
  rebuttal: "Rebuttal",
  cross_examination: "Cross-Ex",
  closing: "Closing",
  final_vote: "Final Vote",
};

export const ROUND_PHASE_PURPOSE: Record<DebateRoundPhase, string> = {
  opening: "Each debater states their strongest case for their side. One opening statement per debater, up to 300 words.",
  rebuttal:
    "Debaters directly respond to a specific opposing (or supporting) claim. Up to two rebuttals per debater, up to 200 words each.",
  cross_examination:
    "A structured interval for probing questions between debaters. Dedicated question/answer tools are not available yet -- this round is read-only for now.",
  closing: "Each debater makes their final, most persuasive case. One closing statement per debater, up to 150 words.",
  final_vote: "The room casts its final verdict on the motion. Argument submission is closed.",
};

export const ROUND_STATUS_LABELS: Record<DebateRoundStatus, string> = {
  scheduled: "Scheduled",
  active: "Active now",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const REACTION_LABELS: Record<DebateReactionType, string> = {
  well_supported: "Well-supported",
  strong_reasoning: "Strong reasoning",
  clear: "Clear",
  strong_rebuttal: "Strong rebuttal",
  fair_to_opposition: "Fair to opposition",
  changed_my_mind: "Changed my mind",
  needs_evidence: "Needs evidence",
};

/** Reactions users are likeliest to reach for first, shown before the picker expands. */
export const TOP_REACTION_TYPES: readonly DebateReactionType[] = [
  "well_supported",
  "strong_rebuttal",
  "changed_my_mind",
];

/** "needs_evidence" reads as constructive criticism, not praise -- kept visually distinct from the others. */
export const CRITICAL_REACTION_TYPES: readonly DebateReactionType[] = ["needs_evidence"];

export const RELATION_TYPE_LABELS: Record<DebateArgumentRelationType, string> = {
  supports: "Supports",
  challenges: "Challenges",
  answers: "Answers",
  clarifies: "Clarifies",
};

export const RELATION_TYPE_DESCRIPTIONS: Record<DebateArgumentRelationType, string> = {
  supports: "Reinforces an earlier point on your own side.",
  challenges: "Directly disputes an opposing claim (must target the other side).",
  answers: "Responds to a question or challenge raised earlier.",
  clarifies: "Adds precision to an earlier claim without disputing it.",
};

export const ENTRY_TYPE_LABELS: Record<DebateArgumentEntryType, string> = {
  opening: "Opening",
  claim: "Claim",
  rebuttal: "Rebuttal",
  answer: "Answer",
  closing: "Closing",
};

export const STANCE_LABELS = {
  for: "For",
  against: "Against",
} as const;

export const CROSS_EXCHANGE_STATUS_LABELS: Record<CrossExchangeDisplayStatus, string> = {
  answered: "Answered",
  awaiting_answer: "Awaiting answer",
  expired_unanswered: "Unanswered",
};
