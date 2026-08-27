/**
 * Deadline reminders for Debate V1.5.
 *
 * V1.5 advances only when a moderator acts ("advancement is manual for this
 * pilot"), and every other V1.5 notification is triggered by someone clicking
 * something. Nothing watched the clock, so a debate whose moderator went quiet
 * stalled indefinitely: debaters locked out of submitting once the deadline
 * passed, the moderator unaware anything was waiting on them, and nobody told
 * either way.
 *
 * This module decides who should hear what. The decision half is a pure
 * function so the timing rules can be tested directly; see
 * app/api/cron/debate-v15-deadlines for the job that feeds and delivers it.
 */

export type DebateV15ReminderPhase =
  | "recruiting"
  | "opening"
  | "rebuttal"
  | "voting";

export type DebateV15ReminderKind =
  | "deadline_soon"
  | "deadline_missed_moderator"
  | "deadline_missed_participant";

/**
 * How close a deadline must be before the "still unsubmitted" nudge goes out.
 *
 * Supabase Cron evaluates deadlines every 15 minutes. A 24-hour window gives
 * participants a standard one-day warning while the durable reminder ledger
 * keeps repeated evaluations to a single message per recipient and phase.
 */
export const REMINDER_SOON_WINDOW_HOURS = 24;

export interface DebateV15ReminderCandidate {
  debateId: string;
  debateTitle: string;
  phase: DebateV15ReminderPhase;
  /** ISO timestamp of the current phase's deadline, or null if unscheduled. */
  deadline: string | null;
  moderatorId: string | null;
  /** Only debaters who accepted; invited-but-unanswered slots owe nothing yet. */
  acceptedSlots: Array<{ userId: string; stance: "for" | "against" }>;
  /** Authors who already submitted for the *current* phase. */
  submittedAuthorIds: string[];
}

export interface PlannedDebateV15Reminder {
  kind: DebateV15ReminderKind;
  recipientId: string;
  debateId: string;
  debateTitle: string;
  phase: DebateV15ReminderPhase;
  /** Present on deadline_soon only. */
  hoursLeft?: number;
  /** Present on deadline_missed_moderator only. */
  missingSides?: Array<"for" | "against">;
}

/** Phases where a debater personally owes a submission. */
function isSubmissionPhase(
  phase: DebateV15ReminderPhase
): phase is "opening" | "rebuttal" {
  return phase === "opening" || phase === "rebuttal";
}

export function planDebateV15Reminders(
  candidate: DebateV15ReminderCandidate,
  nowMs: number
): PlannedDebateV15Reminder[] {
  if (!candidate.deadline) return [];

  const deadlineMs = new Date(candidate.deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return [];

  const common = {
    debateId: candidate.debateId,
    debateTitle: candidate.debateTitle,
    phase: candidate.phase,
  };

  const submitted = new Set(candidate.submittedAuthorIds);
  const outstanding = candidate.acceptedSlots.filter(
    (slot) => !submitted.has(slot.userId)
  );

  // --- Deadline still ahead: warn whoever still owes a submission ---------
  if (deadlineMs > nowMs) {
    if (!isSubmissionPhase(candidate.phase)) return [];

    const hoursLeft = (deadlineMs - nowMs) / 3_600_000;
    if (hoursLeft > REMINDER_SOON_WINDOW_HOURS) return [];

    // Someone who has already submitted has nothing left to do this phase,
    // so reminding them would be pure noise.
    return outstanding.map((slot) => ({
      ...common,
      kind: "deadline_soon" as const,
      recipientId: slot.userId,
      hoursLeft,
    }));
  }

  // --- Deadline passed: the room cannot move without the moderator -------
  const planned: PlannedDebateV15Reminder[] = [];

  if (candidate.moderatorId) {
    planned.push({
      ...common,
      kind: "deadline_missed_moderator",
      recipientId: candidate.moderatorId,
      missingSides: isSubmissionPhase(candidate.phase)
        ? outstanding.map((slot) => slot.stance)
        : [],
    });
  }

  // Debaters are told too, so a stalled debate reads as "waiting on the
  // moderator" rather than as their own failure or a dead room. The
  // moderator is skipped here even when they also hold a slot -- they
  // already got the more actionable message above.
  for (const slot of candidate.acceptedSlots) {
    if (slot.userId === candidate.moderatorId) continue;
    planned.push({
      ...common,
      kind: "deadline_missed_participant",
      recipientId: slot.userId,
    });
  }

  return planned;
}
