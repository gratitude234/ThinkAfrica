/**
 * Shape of, and comparison for, the V1.5 room's cheap change-detection
 * signal. Deliberately a plain module, not part of loadRoomSignal.ts's
 * "use server" file: the comparison runs on the client between polls and
 * must not cost a server round-trip of its own.
 */

export interface DebateV15RoomSignal {
  status: string;
  phase: string;
  recruitingDeadline: string | null;
  openingDeadline: string | null;
  rebuttalDeadline: string | null;
  votingDeadline: string | null;
  forVotes: number;
  againstVotes: number;
  recapStatus: string | null;
  cancelledAt: string | null;
  /** id:upvotes per argument, so new posts *and* upvote changes both show. */
  argumentFingerprint: string;
  /** stance:status per slot, so invite/accept/decline transitions show. */
  slotFingerprint: string;
}

/**
 * The same signal, derived from room data the client already has.
 *
 * This seeds the polling baseline at mount. Without it the first tick has
 * nothing to compare against and can only record a baseline, so anything
 * that changed between the server render and that first tick would be
 * missed until some *later* change happened to trigger a reload.
 */
export function debateV15SignalFromRoom(room: {
  debate: {
    status: string;
    phase: string;
    recruitingDeadline: string | null;
    openingDeadline: string | null;
    rebuttalDeadline: string | null;
    votingDeadline: string | null;
    forVotes: number;
    againstVotes: number;
    recapStatus: string | null;
    cancelledAt: string | null;
  };
  arguments: Array<{ id: string; upvotes: number }>;
  slots: Array<{ stance: string; status: string }>;
}): DebateV15RoomSignal {
  return {
    status: room.debate.status,
    phase: room.debate.phase,
    recruitingDeadline: room.debate.recruitingDeadline,
    openingDeadline: room.debate.openingDeadline,
    rebuttalDeadline: room.debate.rebuttalDeadline,
    votingDeadline: room.debate.votingDeadline,
    forVotes: room.debate.forVotes,
    againstVotes: room.debate.againstVotes,
    recapStatus: room.debate.recapStatus,
    cancelledAt: room.debate.cancelledAt,
    argumentFingerprint: room.arguments
      .map((argument) => `${argument.id}:${argument.upvotes}`)
      .sort()
      .join(","),
    slotFingerprint: room.slots
      .map((slot) => `${slot.stance}:${slot.status}`)
      .sort()
      .join(","),
  };
}

export function debateV15SignalsDiffer(
  previous: DebateV15RoomSignal,
  next: DebateV15RoomSignal
): boolean {
  return (
    previous.status !== next.status ||
    previous.phase !== next.phase ||
    previous.recruitingDeadline !== next.recruitingDeadline ||
    previous.openingDeadline !== next.openingDeadline ||
    previous.rebuttalDeadline !== next.rebuttalDeadline ||
    previous.votingDeadline !== next.votingDeadline ||
    previous.forVotes !== next.forVotes ||
    previous.againstVotes !== next.againstVotes ||
    previous.recapStatus !== next.recapStatus ||
    previous.cancelledAt !== next.cancelledAt ||
    previous.argumentFingerprint !== next.argumentFingerprint ||
    previous.slotFingerprint !== next.slotFingerprint
  );
}
