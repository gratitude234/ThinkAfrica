/**
 * Debate V2 Phase 3: view-model types for the V2 room.
 *
 * These describe the shape the server data loader (loadRoomData.ts)
 * produces and the client components consume -- distinct from the raw
 * database row shapes, and distinct from lib/debateV2.ts's schema-mirroring
 * literal unions, which are imported and reused here rather than
 * redeclared.
 */

import type {
  DebateArgumentEntryType,
  DebateArgumentRelationType,
  DebateBallotVote,
  DebateReactionType,
  DebateRoundPhase,
  DebateRoundStatus,
  DebateStance,
} from "@/lib/debateV2";

export interface DebateV2ProfileSummary {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

export interface DebateV2RoundView {
  id: string;
  sequenceNumber: number;
  phase: DebateRoundPhase;
  status: DebateRoundStatus;
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DebateV2SourceView {
  id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  publishedAt: string | null;
  quotedText: string | null;
}

/** Minimal reference to a parent argument, for rebuttal display -- never a full duplicate of the parent's own view. */
export interface DebateV2ArgumentParentRef {
  id: string;
  claim: string | null;
  authorName: string;
  stance: DebateStance;
}

export interface DebateV2ArgumentView {
  id: string;
  authorId: string;
  author: DebateV2ProfileSummary | null;
  stance: DebateStance;
  entryType: DebateArgumentEntryType | null;
  claim: string | null;
  content: string;
  roundId: string | null;
  roundSequence: number | null;
  parentArgumentId: string | null;
  relationType: DebateArgumentRelationType | null;
  parent: DebateV2ArgumentParentRef | null;
  sources: DebateV2SourceView[];
  /** reaction_type -> count, only for types with at least one reaction. */
  reactionCounts: Partial<Record<DebateReactionType, number>>;
  /** The current viewer's own reactions on this argument. Empty for anonymous viewers. */
  currentUserReactions: DebateReactionType[];
  createdAt: string;
  editedAt: string | null;
}

/**
 * Phase 4A: a structured cross-examination question and its at-most-one
 * answer. Never includes another user's ballot/reaction data -- this is its
 * own dedicated view, not layered onto DebateV2ArgumentView.
 */
export interface DebateV2CrossExchangeView {
  id: string;
  roundId: string;
  askerId: string;
  asker: DebateV2ProfileSummary | null;
  targetId: string;
  target: DebateV2ProfileSummary | null;
  targetArgumentId: string | null;
  /** Reuses the same minimal parent-ref shape arguments use for their own rebuttal target -- never a full duplicate of the argument's own view. */
  targetArgument: DebateV2ArgumentParentRef | null;
  question: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A debater's public identity + locked stance -- used to populate the cross-examination target selector (opposing debaters only, filtered client-side by the viewer's own stance). */
export interface DebateV2DebaterSummary {
  userId: string;
  profile: DebateV2ProfileSummary | null;
  stance: DebateStance;
}

export interface DebateV2MembershipCounts {
  debatersFor: number;
  debatersAgainst: number;
  jurors: number;
}

export interface DebateV2CurrentUserMembership {
  debaterStance: DebateStance | null;
  isJuror: boolean;
  isModeratorMember: boolean;
}

export interface DebateV2OwnBallot {
  vote: DebateBallotVote;
  confidence: number | null;
  reason: string | null;
  influentialArgumentId: string | null;
  updatedAt: string;
}

export interface DebateV2BallotResults {
  forCount: number;
  againstCount: number;
  undecidedCount: number;
  total: number;
  averageConfidence: number | null;
}

export type DebateV2Status = "open" | "active" | "closed";
export type DebateV2ClosureKind = "completed" | "forced" | null;

export interface DebateV2DebateSummary {
  id: string;
  title: string;
  description: string | null;
  status: DebateV2Status;
  closureKind: DebateV2ClosureKind;
  moderator: DebateV2ProfileSummary | null;
  moderatorId: string | null;
  roundDurationMinutes: number | null;
  tags: string[];
  createdAt: string;
  endsAt: string | null;
}

/**
 * Phase 4B: the caller's own debate_subscriptions row, or null if they have
 * never subscribed (no row exists yet -- distinct from an explicit
 * unsubscribe, which is isSubscribed: false on an existing row). Never
 * another user's subscription state -- self-only SELECT, mirrored exactly
 * by this loader's own query (see loadRoomData.ts).
 */
export interface DebateV2SubscriptionView {
  isSubscribed: boolean;
  notifyPhaseChanges: boolean;
  notifyDirectResponses: boolean;
  notifyEvidenceRequests: boolean;
  notifyFinalVote: boolean;
  notifyRecap: boolean;
}

export interface DebateV2CurrentUser {
  id: string | null;
  isAuthenticated: boolean;
  canManage: boolean;
  membership: DebateV2CurrentUserMembership;
  ballots: {
    initial: DebateV2OwnBallot | null;
    final: DebateV2OwnBallot | null;
  };
  /** null for an anonymous viewer, or an authenticated viewer who has never subscribed. */
  subscription: DebateV2SubscriptionView | null;
}

export interface DebateV2RoomView {
  debate: DebateV2DebateSummary;
  rounds: DebateV2RoundView[];
  activeRound: DebateV2RoundView | null;
  membershipCounts: DebateV2MembershipCounts;
  debaters: DebateV2DebaterSummary[];
  currentUser: DebateV2CurrentUser;
  arguments: DebateV2ArgumentView[];
  crossExchanges: DebateV2CrossExchangeView[];
  ballotResults: {
    initial: DebateV2BallotResults | null;
    final: DebateV2BallotResults | null;
  };
}

/**
 * A cheap-to-compute fingerprint of "has anything in this room changed" --
 * count-only/small-fixed-size queries with no joined profile data and no
 * per-row reactor/voter identities, deliberately far cheaper than a full
 * loadDebateV2Room call. Polling checks this every tick and only pays for a
 * full room reload when something in here actually differs from the last
 * tick. See loadRoomSignal.ts and roomSignalsDiffer in lib/debateV2Ui.ts.
 */
export interface DebateV2RoomSignal {
  debateStatus: DebateV2Status;
  closureKind: DebateV2ClosureKind;
  rounds: { id: string; status: DebateRoundStatus; endsAt: string | null }[];
  argumentCount: number;
  reactionCount: number;
  /** Catches a same-tick "one reaction removed, a different one added" that nets to no count change. */
  reactionLatestCreatedAt: string | null;
  /** Phase 4A. Public data (debate_cross_exchanges is public SELECT), so unlike the ballot fields below this needs no visibility gating. crossExchangeLatestUpdatedAt alone already catches both a new question (insert) and a newly submitted answer (update) without the count changing. */
  crossExchangeCount: number;
  crossExchangeLatestUpdatedAt: string | null;
  membershipCount: number;
  /** Caller-specific, computed live server-side -- catches a moderator reassignment or an editor/admin role change even though neither moves membershipCount (one row deleted, one inserted). */
  canManage: boolean;
  /**
   * Computed SECURITY DEFINER server-side (get_debate_room_signal_v2) --
   * debate_ballots is self-only SELECT under RLS, so this could not be
   * computed accurately from an ordinary client-scoped query. Each stage's
   * count/timestamp is null unless the caller satisfies
   * get_debate_ballot_results_v2's own visibility rule for that stage --
   * never exposed to a caller who couldn't see that stage's results anyway.
   */
  initialBallotCount: number | null;
  initialBallotLatestUpdatedAt: string | null;
  finalBallotCount: number | null;
  finalBallotLatestUpdatedAt: string | null;
}
