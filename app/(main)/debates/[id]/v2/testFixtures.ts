/**
 * Debate V2 Phase 3: shared view-model fixtures for the v2/*.test.tsx suite.
 * Not a test file itself -- plain builder functions so each test only
 * overrides the fields it cares about.
 */

import type {
  DebateV2ArgumentView,
  DebateV2BallotResults,
  DebateV2CrossExchangeView,
  DebateV2DebateSummary,
  DebateV2ProfileSummary,
  DebateV2RoomView,
  DebateV2RoundView,
} from "./types";

export function makeProfile(overrides: Partial<DebateV2ProfileSummary> = {}): DebateV2ProfileSummary {
  return {
    id: "author-1",
    username: "ada",
    full_name: "Ada Lovelace",
    university: null,
    avatar_url: null,
    ...overrides,
  };
}

export function makeRound(overrides: Partial<DebateV2RoundView> = {}): DebateV2RoundView {
  return {
    id: "round-1",
    sequenceNumber: 1,
    phase: "opening",
    status: "scheduled",
    startsAt: null,
    endsAt: null,
    durationMinutes: 30,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

export function makeArgument(overrides: Partial<DebateV2ArgumentView> = {}): DebateV2ArgumentView {
  return {
    id: "arg-1",
    authorId: "author-1",
    author: makeProfile(),
    stance: "for",
    entryType: "opening",
    claim: "A one-line claim",
    content: "Some argument content that supports the claim.",
    roundId: "round-1",
    roundSequence: 1,
    parentArgumentId: null,
    relationType: null,
    parent: null,
    sources: [],
    reactionCounts: {},
    currentUserReactions: [],
    createdAt: "2026-07-17T00:00:00.000Z",
    editedAt: null,
    ...overrides,
  };
}

export function makeCrossExchange(overrides: Partial<DebateV2CrossExchangeView> = {}): DebateV2CrossExchangeView {
  return {
    id: "exchange-1",
    roundId: "round-3",
    askerId: "asker-1",
    asker: makeProfile({ id: "asker-1", username: "asker", full_name: "Asker One" }),
    targetId: "target-1",
    target: makeProfile({ id: "target-1", username: "target", full_name: "Target One" }),
    targetArgumentId: null,
    targetArgument: null,
    question: "Why do you believe that?",
    answer: null,
    answeredAt: null,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

export function makeBallotResults(overrides: Partial<DebateV2BallotResults> = {}): DebateV2BallotResults {
  return {
    forCount: 3,
    againstCount: 2,
    undecidedCount: 1,
    total: 6,
    averageConfidence: 3.4,
    ...overrides,
  };
}

export function makeDebateSummary(overrides: Partial<DebateV2DebateSummary> = {}): DebateV2DebateSummary {
  return {
    id: "debate-1",
    title: "Should X happen?",
    description: null,
    status: "open",
    closureKind: null,
    moderator: null,
    moderatorId: null,
    roundDurationMinutes: 30,
    tags: [],
    createdAt: "2026-07-17T00:00:00.000Z",
    endsAt: null,
    ...overrides,
  };
}

const DEFAULT_ROUNDS: DebateV2RoundView[] = [
  makeRoundInternal({ id: "round-1", sequenceNumber: 1, phase: "opening", status: "scheduled" }),
  makeRoundInternal({ id: "round-2", sequenceNumber: 2, phase: "rebuttal", status: "scheduled" }),
  makeRoundInternal({ id: "round-3", sequenceNumber: 3, phase: "cross_examination", status: "scheduled" }),
  makeRoundInternal({ id: "round-4", sequenceNumber: 4, phase: "closing", status: "scheduled" }),
  makeRoundInternal({ id: "round-5", sequenceNumber: 5, phase: "final_vote", status: "scheduled" }),
];

function makeRoundInternal(overrides: Partial<DebateV2RoundView> = {}): DebateV2RoundView {
  return makeRound(overrides);
}

export function makeRoom(overrides: Partial<DebateV2RoomView> = {}): DebateV2RoomView {
  return {
    debate: makeDebateSummary(),
    rounds: DEFAULT_ROUNDS,
    activeRound: null,
    membershipCounts: { debatersFor: 1, debatersAgainst: 1, jurors: 0 },
    debaters: [],
    currentUser: {
      id: "viewer-1",
      isAuthenticated: true,
      canManage: false,
      membership: { debaterStance: null, isJuror: false, isModeratorMember: false },
      ballots: { initial: null, final: null },
      subscription: null,
    },
    arguments: [],
    crossExchanges: [],
    ballotResults: { initial: null, final: null },
    ...overrides,
  };
}
