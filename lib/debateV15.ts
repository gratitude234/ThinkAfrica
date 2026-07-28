export type DebateV15Phase =
  | "recruiting"
  | "opening"
  | "rebuttal"
  | "voting"
  | "completed";

export type DebateV15Stance = "for" | "against";
export type DebateV15ArgumentPhase = "opening" | "rebuttal";
export type DebateV15RecapStatus =
  | "none"
  | "pending"
  | "generating"
  | "ready"
  | "failed";

export const DEBATE_V15_PHASE_ORDER: readonly DebateV15Phase[] = [
  "recruiting",
  "opening",
  "rebuttal",
  "voting",
  "completed",
];

export const DEBATE_V15_WORD_LIMITS: Readonly<
  Record<DebateV15ArgumentPhase, number>
> = {
  opening: 300,
  rebuttal: 200,
};

export const DEBATE_V15_SUBMISSIONS_PER_PHASE = 1;
export const DEBATE_V15_MAX_SOURCES = 5;

export function nextDebateV15Phase(
  phase: DebateV15Phase
): DebateV15Phase | null {
  const index = DEBATE_V15_PHASE_ORDER.indexOf(phase);
  if (index < 0 || index === DEBATE_V15_PHASE_ORDER.length - 1) return null;
  return DEBATE_V15_PHASE_ORDER[index + 1];
}

export function isManualDebateV15Transition(
  current: DebateV15Phase,
  next: DebateV15Phase
): boolean {
  return (
    (current === "recruiting" && next === "opening") ||
    (current === "opening" && next === "rebuttal") ||
    (current === "rebuttal" && next === "voting") ||
    (current === "voting" && next === "completed")
  );
}

export function countDebateV15Words(content: string): number {
  const trimmed = content.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function debateV15WordLimit(
  phase: DebateV15ArgumentPhase
): number {
  return DEBATE_V15_WORD_LIMITS[phase];
}

export function isDebateV15ArgumentWithinLimit(
  phase: DebateV15ArgumentPhase,
  content: string
): boolean {
  const count = countDebateV15Words(content);
  return count > 0 && count <= debateV15WordLimit(phase);
}

export function isDebateV15DeadlineOpen(
  deadline: string | Date | null,
  now = new Date()
): boolean {
  if (deadline === null) return false;
  const timestamp =
    deadline instanceof Date ? deadline.getTime() : new Date(deadline).getTime();
  return Number.isFinite(timestamp) && now.getTime() <= timestamp;
}

export interface DebateV15Deadlines {
  recruiting: string | Date;
  opening: string | Date;
  rebuttal: string | Date;
  voting: string | Date;
}

export function areDebateV15DeadlinesStrictlyIncreasing(
  deadlines: DebateV15Deadlines,
  now = new Date()
): boolean {
  const values = [
    deadlines.recruiting,
    deadlines.opening,
    deadlines.rebuttal,
    deadlines.voting,
  ].map((value) =>
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  );

  return (
    values.every(Number.isFinite) &&
    values[0] > now.getTime() &&
    values[0] < values[1] &&
    values[1] < values[2] &&
    values[2] < values[3]
  );
}

export interface DebateV15SlotReadiness {
  stance: DebateV15Stance;
  status: "invited" | "accepted" | "declined";
}

export function hasBothAcceptedDebateV15Slots(
  slots: readonly DebateV15SlotReadiness[]
): boolean {
  return (["for", "against"] as const).every((stance) =>
    slots.some((slot) => slot.stance === stance && slot.status === "accepted")
  );
}

export function debateV15RoundNumber(
  phase: DebateV15ArgumentPhase
): 1 | 2 {
  return phase === "opening" ? 1 : 2;
}

export function isValidDebateV15SourceUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function canSubmitDebateV15Argument(input: {
  debateStatus: "open" | "active" | "closed" | "cancelled";
  currentPhase: DebateV15Phase;
  expectedPhase: DebateV15ArgumentPhase;
  deadline: string | Date | null;
  slotStatus: "invited" | "accepted" | "declined" | null;
  existingSubmissionCount: number;
  content: string;
  sources: readonly string[];
  now?: Date;
}): boolean {
  return (
    input.debateStatus === "active" &&
    input.currentPhase === input.expectedPhase &&
    isDebateV15DeadlineOpen(input.deadline, input.now) &&
    input.slotStatus === "accepted" &&
    input.existingSubmissionCount < DEBATE_V15_SUBMISSIONS_PER_PHASE &&
    isDebateV15ArgumentWithinLimit(input.expectedPhase, input.content) &&
    input.sources.length <= DEBATE_V15_MAX_SOURCES &&
    input.sources.every(isValidDebateV15SourceUrl)
  );
}

export function canCastDebateV15FinalVote(input: {
  debateStatus: "open" | "active" | "closed" | "cancelled";
  currentPhase: DebateV15Phase;
  votingDeadline: string | Date | null;
  now?: Date;
}): boolean {
  return (
    input.debateStatus === "active" &&
    input.currentPhase === "voting" &&
    isDebateV15DeadlineOpen(input.votingDeadline, input.now)
  );
}

export type DebateV15VerdictOutcome =
  | "no_votes"
  | "tied"
  | "for"
  | "against";

export function resolveDebateV15Verdict(
  forVotes: number,
  againstVotes: number
): {
  total: number;
  forPercent: number;
  againstPercent: number;
  outcome: DebateV15VerdictOutcome;
} {
  const safeForVotes = Math.max(0, Math.trunc(forVotes));
  const safeAgainstVotes = Math.max(0, Math.trunc(againstVotes));
  const total = safeForVotes + safeAgainstVotes;
  const forPercent = total
    ? Math.round((safeForVotes / total) * 100)
    : 0;
  const againstPercent = total ? 100 - forPercent : 0;
  const outcome: DebateV15VerdictOutcome =
    total === 0
      ? "no_votes"
      : safeForVotes === safeAgainstVotes
        ? "tied"
        : safeForVotes > safeAgainstVotes
          ? "for"
          : "against";

  return { total, forPercent, againstPercent, outcome };
}
