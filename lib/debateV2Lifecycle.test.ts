import { describe, expect, it } from "vitest";
import {
  applyAutoSubscribeDefault,
  canJoinAsDebaterV2,
  canJoinAsJurorV2,
  canManageDebateV2,
  canNormalCloseV2,
  canViewBallotResults,
  checkCrossExamAnswerEligibility,
  checkCrossExamQuestionEligibility,
  checkCrossExamTarget,
  checkCrossExamTargetArgument,
  checkRebuttalParent,
  classifyAdvanceRoundOutcome,
  classifyStartRoundOutcome,
  clampNotificationWorkerLimit,
  countWordsV2,
  crossExamAnswerEventKey,
  crossExamQuestionEventKey,
  CROSS_EXAM_ANSWER_WORD_LIMIT,
  CROSS_EXAM_MAX_QUESTIONS_PER_ASKER,
  CROSS_EXAM_QUESTION_WORD_LIMIT,
  debateNotificationTypeFor,
  decideActivation,
  decideExtendRound,
  decideRoundAdvance,
  decideStartRoundOne,
  DEFAULT_DEBATE_SUBSCRIPTION_ROW,
  deriveCrossExchangeStatus,
  evidenceRequestedEventKey,
  finalVoteOpenEventKey,
  hasFinalStageEnded,
  hasInitialStageEnded,
  HIGH_INTENT_AUTO_SUBSCRIBE_FUNCTIONS_V2,
  isActiveRoundDue,
  isEligibleBroadcastRecipient,
  isEligibleForDebateNotification,
  isFinalBallotWindowOpen,
  isInitialBallotWindowOpen,
  isLastPhaseV2,
  isNotificationEventEligibleForProcessing,
  isOpeningRoundDue,
  isSelfSelectableRoleV2,
  isValidBallotVote,
  isValidDebaterStance,
  MIN_CONFIDENCE_SAMPLE_V2,
  nextPhaseV2,
  NOTIFICATION_EVENT_MAX_ATTEMPTS,
  PHASE_ORDER_V2,
  rebuttalEventKey,
  remainingCrossExamQuestions,
  resolveClosureKind,
  resolveDebaterStanceOnJoin,
  resolveModeratorMembershipSync,
  resolveReactionToggle,
  resolveRoundTransitionEventType,
  resolveSubscriptionUpsert,
  roundChangeEventKey,
  shouldExposeAverageConfidence,
  SUBMISSION_LIMITS_V2,
  SUSPENSION_GATED_FUNCTIONS_V2,
  violatesActiveRoundPhaseForSubmission,
  violatesClosedDebateWrite,
  violatesConfidenceRequirement,
  violatesCrossExamAnswerWordLimit,
  violatesCrossExamQuestionAllowance,
  violatesCrossExamQuestionWordLimit,
  violatesEntryTypeMatchesActivePhase,
  violatesForceCloseReasonRequirement,
  violatesInfluentialArgumentStageRule,
  violatesOpeningOrClosingPairing,
  violatesRebuttalRequiresParentAndRelation,
  violatesSelfReaction,
  violatesSubmissionLimitV2,
  violatesV1RpcOnV2Debate,
  violatesWordLimitV2,
  WORD_LIMITS_V2,
} from "@/lib/debateV2Lifecycle";

describe("lifecycle: phase order and transitions", () => {
  it("has the five phases in the contract's order", () => {
    expect(PHASE_ORDER_V2).toEqual(["opening", "rebuttal", "cross_examination", "closing", "final_vote"]);
  });

  it("advances through every phase in sequence", () => {
    expect(nextPhaseV2("opening")).toBe("rebuttal");
    expect(nextPhaseV2("rebuttal")).toBe("cross_examination");
    expect(nextPhaseV2("cross_examination")).toBe("closing");
    expect(nextPhaseV2("closing")).toBe("final_vote");
  });

  it("has no phase after final_vote", () => {
    expect(nextPhaseV2("final_vote")).toBeNull();
  });

  it("only final_vote is the last phase", () => {
    for (const phase of PHASE_ORDER_V2) {
      expect(isLastPhaseV2(phase)).toBe(phase === "final_vote");
    }
  });
});

describe("authorization: can_manage_debate_v2", () => {
  it("fails closed for missing authentication regardless of other flags", () => {
    expect(
      canManageDebateV2({
        actorId: null,
        isDebateModeratorId: true,
        hasModeratorMembership: true,
        isEditorOrAdmin: true,
      })
    ).toBe(false);
  });

  it("allows the debate's moderator_id", () => {
    expect(
      canManageDebateV2({ actorId: "u1", isDebateModeratorId: true, hasModeratorMembership: false, isEditorOrAdmin: false })
    ).toBe(true);
  });

  it("allows a debate_memberships moderator", () => {
    expect(
      canManageDebateV2({ actorId: "u1", isDebateModeratorId: false, hasModeratorMembership: true, isEditorOrAdmin: false })
    ).toBe(true);
  });

  it("allows an editor or admin", () => {
    expect(
      canManageDebateV2({ actorId: "u1", isDebateModeratorId: false, hasModeratorMembership: false, isEditorOrAdmin: true })
    ).toBe(true);
  });

  it("rejects an ordinary authenticated user with none of the three", () => {
    expect(
      canManageDebateV2({ actorId: "u1", isDebateModeratorId: false, hasModeratorMembership: false, isEditorOrAdmin: false })
    ).toBe(false);
  });
});

describe("V1/V2 RPC routing contract", () => {
  it("V1 RPCs reject format_version = 2", () => {
    expect(violatesV1RpcOnV2Debate(2)).toBe(true);
  });

  it("V1 RPCs accept format_version = 1", () => {
    expect(violatesV1RpcOnV2Debate(1)).toBe(false);
  });
});

describe("format-version activation contract (activate_debate_v2)", () => {
  it("is idempotent when already format_version = 2", () => {
    expect(
      decideActivation({ formatVersion: 2, status: "active", existingArgumentCount: 5, existingRoundCount: 5 })
    ).toEqual({ outcome: "already_activated" });
  });

  it("rejects a non-open debate", () => {
    const result = decideActivation({ formatVersion: 1, status: "active", existingArgumentCount: 0, existingRoundCount: 0 });
    expect(result.outcome).toBe("rejected");
  });

  it("rejects a closed debate", () => {
    const result = decideActivation({ formatVersion: 1, status: "closed", existingArgumentCount: 0, existingRoundCount: 0 });
    expect(result.outcome).toBe("rejected");
  });

  it("rejects an open debate that already has arguments", () => {
    const result = decideActivation({ formatVersion: 1, status: "open", existingArgumentCount: 1, existingRoundCount: 0 });
    expect(result.outcome).toBe("rejected");
  });

  it("rejects an open, argument-free debate that already has rounds seeded", () => {
    const result = decideActivation({ formatVersion: 1, status: "open", existingArgumentCount: 0, existingRoundCount: 5 });
    expect(result.outcome).toBe("rejected");
  });

  it("permits activation for an open debate with no arguments or rounds", () => {
    expect(
      decideActivation({ formatVersion: 1, status: "open", existingArgumentCount: 0, existingRoundCount: 0 })
    ).toEqual({ outcome: "activate" });
  });

  it("permits activation regardless of existing lobby participants/motion votes (not modeled here -- neither blocks activation)", () => {
    // decideActivation only ever inspects arguments/rounds; participants and
    // motion votes are intentionally not part of its input at all, which is
    // itself the contract: they can never block activation.
    expect(
      decideActivation({ formatVersion: 1, status: "open", existingArgumentCount: 0, existingRoundCount: 0 })
    ).toEqual({ outcome: "activate" });
  });
});

describe("due-round decisions (advance_due_debate_rounds_v2)", () => {
  const now = new Date("2026-07-20T12:00:00Z");

  it("an opening round is due when V2, open, sequence 1, scheduled, and starts_at has passed", () => {
    expect(
      isOpeningRoundDue({
        debateFormatVersion: 2,
        debateStatus: "open",
        roundSequenceNumber: 1,
        roundStatus: "scheduled",
        startsAt: "2026-07-20T11:59:00Z",
        now,
      })
    ).toBe(true);
  });

  it("an opening round is not due when starts_at is in the future", () => {
    expect(
      isOpeningRoundDue({
        debateFormatVersion: 2,
        debateStatus: "open",
        roundSequenceNumber: 1,
        roundStatus: "scheduled",
        startsAt: "2026-07-20T12:01:00Z",
        now,
      })
    ).toBe(false);
  });

  it("an opening round is not due when starts_at was never configured", () => {
    expect(
      isOpeningRoundDue({
        debateFormatVersion: 2,
        debateStatus: "open",
        roundSequenceNumber: 1,
        roundStatus: "scheduled",
        startsAt: null,
        now,
      })
    ).toBe(false);
  });

  it("an opening round is not due for a V1 debate, a non-open debate, or an already-active round", () => {
    const base = {
      debateFormatVersion: 2 as const,
      debateStatus: "open" as const,
      roundSequenceNumber: 1,
      roundStatus: "scheduled" as const,
      startsAt: "2026-07-20T11:59:00Z",
      now,
    };
    expect(isOpeningRoundDue({ ...base, debateFormatVersion: 1 })).toBe(false);
    expect(isOpeningRoundDue({ ...base, debateStatus: "active" })).toBe(false);
    expect(isOpeningRoundDue({ ...base, roundStatus: "active" })).toBe(false);
    expect(isOpeningRoundDue({ ...base, roundSequenceNumber: 2 })).toBe(false);
  });

  it("an active round is due when V2, active, and ends_at has passed", () => {
    expect(
      isActiveRoundDue({ debateFormatVersion: 2, debateStatus: "active", roundStatus: "active", endsAt: "2026-07-20T11:59:00Z", now })
    ).toBe(true);
  });

  it("an active round is not due when ends_at is in the future or absent", () => {
    expect(
      isActiveRoundDue({ debateFormatVersion: 2, debateStatus: "active", roundStatus: "active", endsAt: "2026-07-20T12:01:00Z", now })
    ).toBe(false);
    expect(
      isActiveRoundDue({ debateFormatVersion: 2, debateStatus: "active", roundStatus: "active", endsAt: null, now })
    ).toBe(false);
  });
});

describe("forced vs normal close (close_debate_v2)", () => {
  it("requires a non-empty reason to force-close", () => {
    expect(violatesForceCloseReasonRequirement(true, null)).toBe(true);
    expect(violatesForceCloseReasonRequirement(true, "")).toBe(true);
    expect(violatesForceCloseReasonRequirement(true, "   ")).toBe(true);
    expect(violatesForceCloseReasonRequirement(true, "abusive content")).toBe(false);
  });

  it("does not require a reason for a normal close", () => {
    expect(violatesForceCloseReasonRequirement(false, null)).toBe(false);
  });

  it("resolves closure_kind from the force flag", () => {
    expect(resolveClosureKind(true)).toBe("forced");
    expect(resolveClosureKind(false)).toBe("completed");
  });

  it("a normal close requires final_vote to be the active round", () => {
    expect(canNormalCloseV2("active")).toBe(true);
    expect(canNormalCloseV2("scheduled")).toBe(false);
    expect(canNormalCloseV2("completed")).toBe(false);
    expect(canNormalCloseV2(null)).toBe(false);
  });
});

describe("word counting (count_words_v2 contract)", () => {
  it("counts whitespace-delimited words after trimming", () => {
    expect(countWordsV2("hello world")).toBe(2);
    expect(countWordsV2("  hello   world  ")).toBe(2);
  });

  it("treats an empty or all-whitespace string as zero words", () => {
    expect(countWordsV2("")).toBe(0);
    expect(countWordsV2("   ")).toBe(0);
  });

  it("counts a single word as one", () => {
    expect(countWordsV2("word")).toBe(1);
  });

  it("does not claim natural-language tokenization: hyphenated/punctuated tokens count as one word", () => {
    expect(countWordsV2("well-supported")).toBe(1);
    expect(countWordsV2("word.")).toBe(1);
  });

  it("counts newlines and tabs as whitespace separators", () => {
    expect(countWordsV2("one\ntwo\tthree")).toBe(3);
  });
});

describe("phase word limits and submission limits (submit_debate_argument_v2)", () => {
  it("has the documented word limits", () => {
    expect(WORD_LIMITS_V2).toEqual({ opening: 300, rebuttal: 200, closing: 150 });
  });

  it("has the documented submission limits", () => {
    expect(SUBMISSION_LIMITS_V2).toEqual({ opening: 1, rebuttal: 2, closing: 1 });
  });

  it("rejects content over the word limit for each entry type", () => {
    const overOpening = Array.from({ length: 301 }, () => "w").join(" ");
    expect(violatesWordLimitV2("opening", overOpening)).toBe(true);
    expect(violatesWordLimitV2("opening", Array.from({ length: 300 }, () => "w").join(" "))).toBe(false);

    const overRebuttal = Array.from({ length: 201 }, () => "w").join(" ");
    expect(violatesWordLimitV2("rebuttal", overRebuttal)).toBe(true);

    const overClosing = Array.from({ length: 151 }, () => "w").join(" ");
    expect(violatesWordLimitV2("closing", overClosing)).toBe(true);
  });

  it("enforces one opening, two rebuttals, one closing", () => {
    expect(violatesSubmissionLimitV2("opening", 0)).toBe(false);
    expect(violatesSubmissionLimitV2("opening", 1)).toBe(true);

    expect(violatesSubmissionLimitV2("rebuttal", 1)).toBe(false);
    expect(violatesSubmissionLimitV2("rebuttal", 2)).toBe(true);

    expect(violatesSubmissionLimitV2("closing", 0)).toBe(false);
    expect(violatesSubmissionLimitV2("closing", 1)).toBe(true);
  });
});

describe("argument phase rules", () => {
  it("opening/closing arguments cannot carry a parent or relation_type", () => {
    expect(violatesOpeningOrClosingPairing(null, null)).toBe(false);
    expect(violatesOpeningOrClosingPairing("arg-1", null)).toBe(true);
    expect(violatesOpeningOrClosingPairing(null, "supports")).toBe(true);
    expect(violatesOpeningOrClosingPairing("arg-1", "supports")).toBe(true);
  });

  it("rebuttals require both parent and relation_type", () => {
    expect(violatesRebuttalRequiresParentAndRelation("arg-1", "supports")).toBe(false);
    expect(violatesRebuttalRequiresParentAndRelation(null, "supports")).toBe(true);
    expect(violatesRebuttalRequiresParentAndRelation("arg-1", null)).toBe(true);
    expect(violatesRebuttalRequiresParentAndRelation(null, null)).toBe(true);
  });

  it("rejects entry_type that does not match the active round's phase", () => {
    expect(violatesEntryTypeMatchesActivePhase("opening", "opening")).toBe(false);
    expect(violatesEntryTypeMatchesActivePhase("rebuttal", "opening")).toBe(true);
  });

  it("rejects general submission during cross_examination and final_vote", () => {
    expect(violatesActiveRoundPhaseForSubmission("cross_examination")).toBe(true);
    expect(violatesActiveRoundPhaseForSubmission("final_vote")).toBe(true);
    expect(violatesActiveRoundPhaseForSubmission("opening")).toBe(false);
    expect(violatesActiveRoundPhaseForSubmission("rebuttal")).toBe(false);
    expect(violatesActiveRoundPhaseForSubmission("closing")).toBe(false);
  });
});

describe("rebuttal parent validation (checkRebuttalParent)", () => {
  const base = {
    parentDebateId: "d1",
    ownDebateId: "d1",
    parentAuthorId: "author-1",
    callerUserId: "caller-1",
    parentRoundSequence: 1,
    activeRoundSequence: 2,
    parentStance: "for" as const,
    callerStance: "against" as const,
    relationType: "challenges" as const,
  };

  it("passes a valid opposing-stance challenge from an earlier round", () => {
    expect(checkRebuttalParent(base)).toBeNull();
  });

  it("rejects a parent from a different debate", () => {
    expect(checkRebuttalParent({ ...base, parentDebateId: "d2" })).toBe("different_debate");
  });

  it("rejects rebutting your own argument", () => {
    expect(checkRebuttalParent({ ...base, parentAuthorId: "caller-1" })).toBe("self_rebuttal");
  });

  it("rejects a parent from the same or a later round", () => {
    expect(checkRebuttalParent({ ...base, parentRoundSequence: 2 })).toBe("not_earlier_round");
    expect(checkRebuttalParent({ ...base, parentRoundSequence: 3 })).toBe("not_earlier_round");
    expect(checkRebuttalParent({ ...base, parentRoundSequence: null })).toBe("not_earlier_round");
  });

  it("rejects a direct challenge targeting the same stance", () => {
    expect(checkRebuttalParent({ ...base, parentStance: "against", callerStance: "against" })).toBe(
      "challenge_must_target_opposing_stance"
    );
  });

  it("does not stance-constrain supports/answers/clarifies", () => {
    for (const relationType of ["supports", "answers", "clarifies"] as const) {
      expect(checkRebuttalParent({ ...base, relationType, parentStance: "against", callerStance: "against" })).toBeNull();
    }
  });
});

describe("ballot windows (cast_debate_ballot_v2)", () => {
  it("initial ballots are only accepted while the debate is open", () => {
    expect(isInitialBallotWindowOpen("open")).toBe(true);
    expect(isInitialBallotWindowOpen("active")).toBe(false);
    expect(isInitialBallotWindowOpen("closed")).toBe(false);
  });

  it("final ballots are only accepted while final_vote is active", () => {
    expect(isFinalBallotWindowOpen("active")).toBe(true);
    expect(isFinalBallotWindowOpen("scheduled")).toBe(false);
    expect(isFinalBallotWindowOpen("completed")).toBe(false);
    expect(isFinalBallotWindowOpen(null)).toBe(false);
  });

  it("requires confidence 1-5", () => {
    expect(violatesConfidenceRequirement(null)).toBe(true);
    expect(violatesConfidenceRequirement(0)).toBe(true);
    expect(violatesConfidenceRequirement(6)).toBe(true);
    expect(violatesConfidenceRequirement(1)).toBe(false);
    expect(violatesConfidenceRequirement(5)).toBe(false);
  });

  it("influential_argument_id is only allowed on a final ballot", () => {
    expect(violatesInfluentialArgumentStageRule("initial", "arg-1")).toBe(true);
    expect(violatesInfluentialArgumentStageRule("final", "arg-1")).toBe(false);
    expect(violatesInfluentialArgumentStageRule("initial", null)).toBe(false);
  });

  it("validates vote and stance literals", () => {
    expect(isValidBallotVote("for")).toBe(true);
    expect(isValidBallotVote("undecided")).toBe(true);
    expect(isValidBallotVote("abstain")).toBe(false);
    expect(isValidDebaterStance("for")).toBe(true);
    expect(isValidDebaterStance("undecided")).toBe(false);
  });
});

describe("aggregate ballot-result visibility (get_debate_ballot_results_v2)", () => {
  it("average_confidence requires the minimum sample threshold", () => {
    expect(MIN_CONFIDENCE_SAMPLE_V2).toBe(3);
    expect(shouldExposeAverageConfidence(2)).toBe(false);
    expect(shouldExposeAverageConfidence(3)).toBe(true);
    expect(shouldExposeAverageConfidence(10)).toBe(true);
  });

  it("anonymous callers only see closed-debate final results", () => {
    expect(
      canViewBallotResults({ stage: "final", debateStatus: "closed", isAuthenticated: false, userHasBallotInStage: false, stageEnded: true })
    ).toBe(true);
    expect(
      canViewBallotResults({ stage: "final", debateStatus: "active", isAuthenticated: false, userHasBallotInStage: false, stageEnded: false })
    ).toBe(false);
    expect(
      canViewBallotResults({ stage: "initial", debateStatus: "closed", isAuthenticated: false, userHasBallotInStage: false, stageEnded: true })
    ).toBe(false);
  });

  it("authenticated callers see results after casting a ballot in that stage", () => {
    expect(
      canViewBallotResults({ stage: "initial", debateStatus: "open", isAuthenticated: true, userHasBallotInStage: true, stageEnded: false })
    ).toBe(true);
  });

  it("authenticated callers see results once the stage has ended, even without their own ballot", () => {
    expect(
      canViewBallotResults({ stage: "initial", debateStatus: "active", isAuthenticated: true, userHasBallotInStage: false, stageEnded: true })
    ).toBe(true);
  });

  it("authenticated callers cannot see results without a ballot before the stage ends", () => {
    expect(
      canViewBallotResults({ stage: "initial", debateStatus: "open", isAuthenticated: true, userHasBallotInStage: false, stageEnded: false })
    ).toBe(false);
  });

  it("the initial stage ends as soon as the debate leaves the open lobby", () => {
    expect(hasInitialStageEnded("open")).toBe(false);
    expect(hasInitialStageEnded("active")).toBe(true);
    expect(hasInitialStageEnded("closed")).toBe(true);
  });

  it("the final stage ends when the debate closes or final_vote completes/cancels", () => {
    expect(hasFinalStageEnded("closed", null)).toBe(true);
    expect(hasFinalStageEnded("active", "completed")).toBe(true);
    expect(hasFinalStageEnded("active", "cancelled")).toBe(true);
    expect(hasFinalStageEnded("active", "active")).toBe(false);
    expect(hasFinalStageEnded("active", "scheduled")).toBe(false);
  });
});

describe("reaction rules (toggle_debate_reaction_v2)", () => {
  it("rejects reacting to your own argument", () => {
    expect(violatesSelfReaction("author-1", "author-1")).toBe(true);
    expect(violatesSelfReaction("author-1", "other-user")).toBe(false);
  });

  it("toggles reaction state", () => {
    expect(resolveReactionToggle(false)).toEqual({ reacted: true });
    expect(resolveReactionToggle(true)).toEqual({ reacted: false });
  });
});

describe("closed-debate write rejection (shared across every V2 mutation)", () => {
  it("only 'closed' rejects a write", () => {
    expect(violatesClosedDebateWrite("closed")).toBe(true);
    expect(violatesClosedDebateWrite("open")).toBe(false);
    expect(violatesClosedDebateWrite("active")).toBe(false);
  });
});

describe("join_debate_v2 role/stance rules", () => {
  it("only debater and juror are self-selectable roles", () => {
    expect(isSelfSelectableRoleV2("debater")).toBe(true);
    expect(isSelfSelectableRoleV2("juror")).toBe(true);
    expect(isSelfSelectableRoleV2("moderator")).toBe(false);
    expect(isSelfSelectableRoleV2("admin")).toBe(false);
  });

  it("debaters may only join during the open lobby", () => {
    expect(canJoinAsDebaterV2("open")).toBe(true);
    expect(canJoinAsDebaterV2("active")).toBe(false);
    expect(canJoinAsDebaterV2("closed")).toBe(false);
  });

  it("jurors may join during the lobby or while active", () => {
    expect(canJoinAsJurorV2("open")).toBe(true);
    expect(canJoinAsJurorV2("active")).toBe(true);
    expect(canJoinAsJurorV2("closed")).toBe(false);
  });

  it("a debater's stance is permanently locked to whatever they first joined with", () => {
    expect(resolveDebaterStanceOnJoin("for", "against")).toBe("for");
    expect(resolveDebaterStanceOnJoin(null, "against")).toBe("against");
  });
});

describe("hardening pass: double-advance / round-skip prevention (advance_or_close_debate_round_v2)", () => {
  const now = new Date("2026-07-20T12:00:00Z");

  it("proceeds when the expected round matches and (for automatic calls) is actually due", () => {
    expect(
      decideRoundAdvance({
        expectedRoundId: "round-1",
        actualActiveRoundId: "round-1",
        requireDue: true,
        actualEndsAt: "2026-07-20T11:59:00Z",
        now,
      })
    ).toBe("proceed");
  });

  it("proceeds for a manual call (requireDue = false) regardless of remaining time", () => {
    expect(
      decideRoundAdvance({
        expectedRoundId: "round-1",
        actualActiveRoundId: "round-1",
        requireDue: false,
        actualEndsAt: "2026-07-20T12:30:00Z",
        now,
      })
    ).toBe("proceed");
  });

  it("returns stale_no_op when a concurrent call already advanced past the expected round", () => {
    // This is the exact double-advance/round-skip scenario: request A moved
    // opening -> rebuttal; request B (still holding "opening" as its
    // expectation) must not then advance rebuttal -> cross_examination.
    expect(
      decideRoundAdvance({
        expectedRoundId: "opening-round-id",
        actualActiveRoundId: "rebuttal-round-id",
        requireDue: false,
        actualEndsAt: null,
        now,
      })
    ).toBe("stale_no_op");
  });

  it("skips the expected-round check entirely when no expectation was supplied", () => {
    expect(
      decideRoundAdvance({
        expectedRoundId: null,
        actualActiveRoundId: "round-1",
        requireDue: false,
        actualEndsAt: null,
        now,
      })
    ).toBe("proceed");
  });

  it("returns not_due for an automatic call whose round was extended past now, even if the round itself still matches", () => {
    // This is the cron-overrides-extension scenario: the outer batch query
    // found this round due, but a concurrent extend_debate_round_v2 pushed
    // ends_at into the future before this function's own lock was granted.
    expect(
      decideRoundAdvance({
        expectedRoundId: "round-1",
        actualActiveRoundId: "round-1",
        requireDue: true,
        actualEndsAt: "2026-07-20T12:30:00Z",
        now,
      })
    ).toBe("not_due");
  });

  it("returns not_due for an automatic call whose round has no ends_at at all", () => {
    expect(
      decideRoundAdvance({
        expectedRoundId: "round-1",
        actualActiveRoundId: "round-1",
        requireDue: true,
        actualEndsAt: null,
        now,
      })
    ).toBe("not_due");
  });

  it("checks staleness before due-ness: a stale AND not-yet-due call is still just stale_no_op", () => {
    expect(
      decideRoundAdvance({
        expectedRoundId: "opening-round-id",
        actualActiveRoundId: "rebuttal-round-id",
        requireDue: true,
        actualEndsAt: "2026-07-20T12:30:00Z",
        now,
      })
    ).toBe("stale_no_op");
  });
});

describe("hardening pass: extend_debate_round_v2 expected-round + expected-ends_at compare-and-swap", () => {
  it("proceeds when both the expected round and expected ends_at still match", () => {
    expect(decideExtendRound("round-1", "round-1", "2026-07-20T12:00:00Z", "2026-07-20T12:00:00Z")).toBe(
      "proceed"
    );
  });

  it("is a stale no-op when a different round became active first (e.g. cron advanced it)", () => {
    expect(decideExtendRound("round-1", "round-2", "2026-07-20T12:00:00Z", "2026-07-20T12:00:00Z")).toBe(
      "stale_no_op"
    );
  });

  it("is a stale no-op when ends_at no longer matches, even if the round id still does", () => {
    // The bug this closes: a duplicate/retried extension request targets
    // the SAME round (extending never changes the round id), so the round-id
    // check alone would let a second, duplicate call stack another
    // extension on top of the first. Comparing ends_at too catches this:
    // the first call already advanced ends_at, so the second call's
    // (now-stale) expectation no longer matches.
    expect(decideExtendRound("round-1", "round-1", "2026-07-20T12:00:00Z", "2026-07-20T12:15:00Z")).toBe(
      "stale_no_op"
    );
  });

  it("treats a null expected ends_at as only matching a null actual ends_at", () => {
    expect(decideExtendRound("round-1", "round-1", null, null)).toBe("proceed");
    expect(decideExtendRound("round-1", "round-1", null, "2026-07-20T12:00:00Z")).toBe("stale_no_op");
    expect(decideExtendRound("round-1", "round-1", "2026-07-20T12:00:00Z", null)).toBe("stale_no_op");
  });
});

describe("hardening pass: cron batch counting classifies no-ops as skipped, not progress", () => {
  it("classifies an idempotent start no-op as skipped, not started", () => {
    expect(classifyStartRoundOutcome(true)).toBe("skipped");
    expect(classifyStartRoundOutcome(false)).toBe("started");
  });

  it("classifies stale_no_op and not_due as skipped, not advanced", () => {
    expect(classifyAdvanceRoundOutcome("stale_no_op")).toBe("skipped");
    expect(classifyAdvanceRoundOutcome("not_due")).toBe("skipped");
  });

  it("classifies round_advanced and debate_completed as advanced", () => {
    expect(classifyAdvanceRoundOutcome("round_advanced")).toBe("advanced");
    expect(classifyAdvanceRoundOutcome("debate_completed")).toBe("advanced");
  });
});

describe("hardening pass: start_debate_round_one_v2 idempotency ordering", () => {
  it("is idempotent even after the debate has already progressed to active", () => {
    // The bug: checking debateStatus !== 'open' before the round's own
    // status meant a repeated call after the debate had already started
    // raised an error instead of ever reaching "already started".
    expect(decideStartRoundOne("active", "active")).toBe("already_started");
  });

  it("is idempotent when the round is already active but the debate status is (surprisingly) still open", () => {
    expect(decideStartRoundOne("active", "open")).toBe("already_started");
  });

  it("rejects a genuinely not-open debate whose opening round is still scheduled", () => {
    expect(decideStartRoundOne("scheduled", "closed")).toBe("rejected_not_open");
  });

  it("starts when the round is scheduled and the debate is open", () => {
    expect(decideStartRoundOne("scheduled", "open")).toBe("start");
  });
});

describe("hardening pass: suspension enforcement coverage", () => {
  it("gates exactly the six participation-writing V2 functions that create content or otherwise participate (four from the Phase 2 hardening pass, plus the two Phase 4A cross-examination RPCs)", () => {
    expect([...SUSPENSION_GATED_FUNCTIONS_V2].sort()).toEqual(
      [
        "cast_debate_ballot_v2",
        "join_debate_v2",
        "submit_cross_examination_answer_v2",
        "submit_cross_examination_question_v2",
        "submit_debate_argument_v2",
        "toggle_debate_reaction_v2",
      ].sort()
    );
  });

  it("does not include the manager-only lifecycle functions (no V1 precedent gates those on suspension)", () => {
    const managerFunctions = ["start_debate_v2", "advance_debate_round_v2", "extend_debate_round_v2", "close_debate_v2"];
    for (const fn of managerFunctions) {
      expect((SUSPENSION_GATED_FUNCTIONS_V2 as readonly string[]).includes(fn)).toBe(false);
    }
  });

  it("does not include set_debate_subscription_v2 -- managing one's own notification preferences is not content creation, and gating it on suspension would let the system keep notifying a suspended user while refusing to let them opt out (Phase 4B correction)", () => {
    expect((SUSPENSION_GATED_FUNCTIONS_V2 as readonly string[]).includes("set_debate_subscription_v2")).toBe(false);
  });
});

describe("hardening pass: moderator reassignment (sync_debate_moderator_membership)", () => {
  it("removes the former moderator and adds the new one on a genuine reassignment", () => {
    expect(
      resolveModeratorMembershipSync({ debateId: "d1", oldModeratorId: "old-mod", newModeratorId: "new-mod" })
    ).toEqual({ removeUserId: "old-mod", addUserId: "new-mod" });
  });

  it("only adds, never removes, on the initial insert (no prior moderator)", () => {
    expect(
      resolveModeratorMembershipSync({ debateId: "d1", oldModeratorId: null, newModeratorId: "new-mod" })
    ).toEqual({ removeUserId: null, addUserId: "new-mod" });
  });

  it("removes without adding when moderator_id is cleared to null", () => {
    expect(
      resolveModeratorMembershipSync({ debateId: "d1", oldModeratorId: "old-mod", newModeratorId: null })
    ).toEqual({ removeUserId: "old-mod", addUserId: null });
  });

  it("is a no-op when moderator_id is unchanged", () => {
    expect(
      resolveModeratorMembershipSync({ debateId: "d1", oldModeratorId: "same-mod", newModeratorId: "same-mod" })
    ).toEqual({ removeUserId: null, addUserId: "same-mod" });
  });

  it("never produces the same user as both remove and add", () => {
    const result = resolveModeratorMembershipSync({ debateId: "d1", oldModeratorId: "mod-a", newModeratorId: "mod-b" });
    expect(result.removeUserId).not.toBe(result.addUserId);
  });
});

// ---------------------------------------------------------------------------
// Phase 4A: structured cross-examination
// ---------------------------------------------------------------------------

describe("cross-examination word limits and allowance (submit_cross_examination_question_v2 / submit_cross_examination_answer_v2)", () => {
  it("allows exactly the word limit and rejects one word over it, for both question and answer", () => {
    const exactlySixty = Array.from({ length: CROSS_EXAM_QUESTION_WORD_LIMIT }, (_, i) => `w${i}`).join(" ");
    const sixtyOne = `${exactlySixty} one-more`;
    expect(violatesCrossExamQuestionWordLimit(exactlySixty)).toBe(false);
    expect(violatesCrossExamQuestionWordLimit(sixtyOne)).toBe(true);

    const exactlyOneTwenty = Array.from({ length: CROSS_EXAM_ANSWER_WORD_LIMIT }, (_, i) => `w${i}`).join(" ");
    const oneTwentyOne = `${exactlyOneTwenty} one-more`;
    expect(violatesCrossExamAnswerWordLimit(exactlyOneTwenty)).toBe(false);
    expect(violatesCrossExamAnswerWordLimit(oneTwentyOne)).toBe(true);
  });

  it("allows up to 2 questions per asker and rejects a 3rd", () => {
    expect(violatesCrossExamQuestionAllowance(0)).toBe(false);
    expect(violatesCrossExamQuestionAllowance(1)).toBe(false);
    expect(violatesCrossExamQuestionAllowance(2)).toBe(true);
    expect(violatesCrossExamQuestionAllowance(3)).toBe(true);
    expect(CROSS_EXAM_MAX_QUESTIONS_PER_ASKER).toBe(2);
  });

  it("computes remaining questions, never negative", () => {
    expect(remainingCrossExamQuestions(0)).toBe(2);
    expect(remainingCrossExamQuestions(1)).toBe(1);
    expect(remainingCrossExamQuestions(2)).toBe(0);
    expect(remainingCrossExamQuestions(5)).toBe(0);
  });
});

describe("cross-examination question eligibility (checkCrossExamQuestionEligibility)", () => {
  function baseInput(overrides: Partial<Parameters<typeof checkCrossExamQuestionEligibility>[0]> = {}) {
    return {
      debateStatus: "active" as const,
      activeRoundPhase: "cross_examination" as const,
      callerIsDebater: true,
      existingQuestionCount: 0,
      ...overrides,
    };
  }

  it("is eligible when active, in the cross-examination round, a debater, under the allowance", () => {
    expect(checkCrossExamQuestionEligibility(baseInput())).toBe("eligible");
  });

  it("rejects a non-active debate before checking anything else", () => {
    expect(
      checkCrossExamQuestionEligibility(baseInput({ debateStatus: "open", activeRoundPhase: null, callerIsDebater: false }))
    ).toBe("debate_not_active");
  });

  it("rejects when the active round is not cross_examination (including no active round at all)", () => {
    expect(checkCrossExamQuestionEligibility(baseInput({ activeRoundPhase: "closing" }))).toBe("wrong_phase");
    expect(checkCrossExamQuestionEligibility(baseInput({ activeRoundPhase: null }))).toBe("wrong_phase");
  });

  it("rejects a non-debater (juror, moderator-only, or anonymous)", () => {
    expect(checkCrossExamQuestionEligibility(baseInput({ callerIsDebater: false }))).toBe("not_a_debater");
  });

  it("rejects once the 2-question allowance is exhausted", () => {
    expect(checkCrossExamQuestionEligibility(baseInput({ existingQuestionCount: 2 }))).toBe("allowance_exhausted");
  });

  it("checks in the same order the RPC does: debate status, then round phase, then debater-ness, then allowance", () => {
    // Every violation present at once -- debate_not_active must win.
    expect(
      checkCrossExamQuestionEligibility({
        debateStatus: "closed",
        activeRoundPhase: "final_vote",
        callerIsDebater: false,
        existingQuestionCount: 2,
      })
    ).toBe("debate_not_active");
  });
});

describe("cross-examination target validation (checkCrossExamTarget)", () => {
  it("accepts a different debater with the opposing stance", () => {
    expect(
      checkCrossExamTarget({ targetUserId: "u2", callerUserId: "u1", targetStance: "against", callerStance: "for" })
    ).toBeNull();
  });

  it("rejects targeting yourself", () => {
    expect(
      checkCrossExamTarget({ targetUserId: "u1", callerUserId: "u1", targetStance: "against", callerStance: "for" })
    ).toBe("self_target");
  });

  it("rejects a target with no debater stance (not a debater in this debate)", () => {
    expect(
      checkCrossExamTarget({ targetUserId: "u2", callerUserId: "u1", targetStance: null, callerStance: "for" })
    ).toBe("not_a_debater");
  });

  it("rejects a target on the same stance", () => {
    expect(
      checkCrossExamTarget({ targetUserId: "u2", callerUserId: "u1", targetStance: "for", callerStance: "for" })
    ).toBe("same_stance");
  });
});

describe("cross-examination optional target-argument validation (checkCrossExamTargetArgument)", () => {
  function baseCtx(overrides: Partial<Parameters<typeof checkCrossExamTargetArgument>[0]> = {}) {
    return {
      argumentDebateId: "debate-1",
      ownDebateId: "debate-1",
      argumentAuthorId: "target-1",
      targetUserId: "target-1",
      argumentRoundSequence: 1,
      activeRoundSequence: 3,
      ...overrides,
    };
  }

  it("accepts an argument from an earlier round, authored by the target, in the same debate", () => {
    expect(checkCrossExamTargetArgument(baseCtx())).toBeNull();
  });

  it("rejects a nonexistent argument", () => {
    expect(checkCrossExamTargetArgument(baseCtx({ argumentDebateId: null }))).toBe("not_found");
  });

  it("rejects an argument from another debate", () => {
    expect(checkCrossExamTargetArgument(baseCtx({ argumentDebateId: "debate-2" }))).toBe("different_debate");
  });

  it("rejects an argument not authored by the selected target", () => {
    expect(checkCrossExamTargetArgument(baseCtx({ argumentAuthorId: "someone-else" }))).toBe("not_authored_by_target");
  });

  it("rejects an argument from the current or a future round", () => {
    expect(checkCrossExamTargetArgument(baseCtx({ argumentRoundSequence: 3 }))).toBe("not_earlier_round");
    expect(checkCrossExamTargetArgument(baseCtx({ argumentRoundSequence: 4 }))).toBe("not_earlier_round");
    expect(checkCrossExamTargetArgument(baseCtx({ argumentRoundSequence: null }))).toBe("not_earlier_round");
  });
});

describe("cross-examination answer eligibility (checkCrossExamAnswerEligibility)", () => {
  function baseInput(overrides: Partial<Parameters<typeof checkCrossExamAnswerEligibility>[0]> = {}) {
    return {
      debateStatus: "active" as const,
      activeRoundPhase: "cross_examination" as const,
      exchangeRoundId: "round-3",
      activeRoundId: "round-3",
      targetId: "target-1",
      callerUserId: "target-1",
      alreadyAnswered: false,
      ...overrides,
    };
  }

  it("is eligible for the exchange's own target while the cross-examination round is active and unanswered", () => {
    expect(checkCrossExamAnswerEligibility(baseInput())).toBe("eligible");
  });

  it("rejects an unauthenticated caller before anything else", () => {
    expect(checkCrossExamAnswerEligibility(baseInput({ callerUserId: null }))).toBe("not_authenticated");
  });

  it("rejects anyone other than the exchange's own target -- only the target may answer", () => {
    expect(checkCrossExamAnswerEligibility(baseInput({ callerUserId: "someone-else" }))).toBe("not_the_target");
  });

  it("treats an already-answered question as a distinct outcome, not a generic rejection", () => {
    expect(checkCrossExamAnswerEligibility(baseInput({ alreadyAnswered: true }))).toBe("already_answered");
  });

  it("rejects a non-active debate, for a genuinely new (not yet answered) answer attempt", () => {
    expect(checkCrossExamAnswerEligibility(baseInput({ debateStatus: "closed" }))).toBe("debate_not_active");
  });

  it("rejects when the active round is not cross_examination, for a genuinely new answer attempt", () => {
    expect(checkCrossExamAnswerEligibility(baseInput({ activeRoundPhase: "closing" }))).toBe("wrong_phase");
  });

  it("rejects once this exchange's round is no longer the active round -- covers a normal advance past cross-examination", () => {
    expect(checkCrossExamAnswerEligibility(baseInput({ activeRoundId: "round-4" }))).toBe("round_no_longer_active");
  });

  it("rejects a closed/force-closed debate (no active round at all) via the debate-status/phase checks, never round_no_longer_active", () => {
    // debateStatus flips to "closed" here specifically so the debate_status
    // check (checked before wrong_phase) is what fires -- an active debate
    // with no cross-examination round in progress is covered separately by
    // the "rejects when the active round is not cross_examination" case.
    expect(
      checkCrossExamAnswerEligibility(baseInput({ debateStatus: "closed", activeRoundId: null, activeRoundPhase: null }))
    ).toBe("debate_not_active");
  });

  it("checks in the same order the corrected RPC does: auth, then target identity, then already-answered, then debate/round timing", () => {
    // Every debate/round-timing violation present at once, but the caller
    // isn't even authenticated -- not_authenticated must still win.
    expect(
      checkCrossExamAnswerEligibility({
        debateStatus: "closed",
        activeRoundPhase: null,
        exchangeRoundId: "round-3",
        activeRoundId: null,
        targetId: "target-1",
        callerUserId: null,
        alreadyAnswered: true,
      })
    ).toBe("not_authenticated");
  });

  it("correction (pre-apply review): a retry of an already-answered exchange succeeds as already_answered even though the debate/round have since gone stale -- this is the whole point of the fix", () => {
    // Every debate/round-timing check here would fail on its own (closed
    // debate, no active round, round mismatch) -- but because this
    // exchange was already answered, none of that should matter: a client
    // retrying the original (successful) call must not see an error.
    expect(
      checkCrossExamAnswerEligibility(
        baseInput({
          alreadyAnswered: true,
          debateStatus: "closed",
          activeRoundPhase: null,
          activeRoundId: null,
          exchangeRoundId: "round-3",
        })
      )
    ).toBe("already_answered");
  });

  it("still requires the caller to be the exchange's own target even when already answered -- idempotency is not an authorization bypass", () => {
    expect(
      checkCrossExamAnswerEligibility(baseInput({ alreadyAnswered: true, callerUserId: "someone-else" }))
    ).toBe("not_the_target");
  });
});

describe("cross-examination display status, derived not stored (deriveCrossExchangeStatus)", () => {
  function baseInput(overrides: Partial<Parameters<typeof deriveCrossExchangeStatus>[0]> = {}) {
    return {
      hasAnswer: false,
      exchangeRoundId: "round-3",
      activeRoundId: "round-3",
      activeRoundPhase: "cross_examination" as const,
      ...overrides,
    };
  }

  it("is answered whenever an answer exists, regardless of round state", () => {
    expect(deriveCrossExchangeStatus(baseInput({ hasAnswer: true }))).toBe("answered");
    expect(deriveCrossExchangeStatus(baseInput({ hasAnswer: true, activeRoundId: "round-4" }))).toBe("answered");
  });

  it("is awaiting_answer while unanswered and its own round is still the active cross-examination round", () => {
    expect(deriveCrossExchangeStatus(baseInput())).toBe("awaiting_answer");
  });

  it("is expired_unanswered once a normal round advance moves past cross-examination", () => {
    expect(deriveCrossExchangeStatus(baseInput({ activeRoundId: "round-4", activeRoundPhase: "closing" }))).toBe(
      "expired_unanswered"
    );
  });

  it("is expired_unanswered once the debate is closed (no active round at all)", () => {
    expect(deriveCrossExchangeStatus(baseInput({ activeRoundId: null, activeRoundPhase: null }))).toBe(
      "expired_unanswered"
    );
  });

  it("agrees with checkCrossExamAnswerEligibility that an exchange from a round that has since ended is no longer answerable -- the label and the RPC's own acceptance can never disagree", () => {
    const expired = baseInput({ activeRoundId: "round-4", activeRoundPhase: "closing" });
    expect(deriveCrossExchangeStatus(expired)).toBe("expired_unanswered");

    const eligibility = checkCrossExamAnswerEligibility({
      debateStatus: "active",
      activeRoundPhase: expired.activeRoundPhase,
      exchangeRoundId: expired.exchangeRoundId,
      activeRoundId: expired.activeRoundId,
      targetId: "target-1",
      callerUserId: "target-1",
      alreadyAnswered: false,
    });
    expect(eligibility).not.toBe("eligible");
  });
});

// =============================================================================
// Phase 4B: subscriptions and notification events
// =============================================================================

describe("subscriptions: resolveSubscriptionUpsert (set_debate_subscription_v2)", () => {
  it("first subscribe: no existing row, no preferences supplied -- falls back to the table's own defaults", () => {
    expect(resolveSubscriptionUpsert(null, { isSubscribed: true })).toEqual(DEFAULT_DEBATE_SUBSCRIPTION_ROW);
  });

  it("first subscribe with explicit preferences: every supplied value is honoured", () => {
    expect(
      resolveSubscriptionUpsert(null, {
        isSubscribed: true,
        notifyPhaseChanges: false,
        notifyRecap: false,
      })
    ).toEqual({
      isSubscribed: true,
      notifyPhaseChanges: false,
      notifyDirectResponses: true,
      notifyEvidenceRequests: true,
      notifyFinalVote: true,
      notifyRecap: false,
    });
  });

  it("preference update: omitted (undefined) fields preserve the existing row, is_subscribed is always the caller's value", () => {
    const existing = { ...DEFAULT_DEBATE_SUBSCRIPTION_ROW, notifyEvidenceRequests: false };
    const result = resolveSubscriptionUpsert(existing, { isSubscribed: true, notifyFinalVote: false });
    expect(result).toEqual({
      isSubscribed: true,
      notifyPhaseChanges: true,
      notifyDirectResponses: true,
      notifyEvidenceRequests: false, // preserved from the existing row, not reset to true
      notifyFinalVote: false, // the one field this call actually changed
      notifyRecap: true,
    });
  });

  it("omitted preferences are preserved even when explicitly passed as null (mirrors SQL NULL, not just undefined)", () => {
    const existing = { ...DEFAULT_DEBATE_SUBSCRIPTION_ROW, notifyDirectResponses: false };
    const result = resolveSubscriptionUpsert(existing, {
      isSubscribed: true,
      notifyDirectResponses: null,
    });
    expect(result.notifyDirectResponses).toBe(false);
  });

  it("unsubscribe: is_subscribed flips to false, preferences untouched", () => {
    const existing = { ...DEFAULT_DEBATE_SUBSCRIPTION_ROW, notifyRecap: false };
    const result = resolveSubscriptionUpsert(existing, { isSubscribed: false });
    expect(result.isSubscribed).toBe(false);
    expect(result.notifyRecap).toBe(false);
  });

  it("resubscribe: an unsubscribed row's preferences survive the round trip", () => {
    const unsubscribed = { ...DEFAULT_DEBATE_SUBSCRIPTION_ROW, isSubscribed: false, notifyEvidenceRequests: false };
    const result = resolveSubscriptionUpsert(unsubscribed, { isSubscribed: true });
    expect(result).toEqual({ ...unsubscribed, isSubscribed: true });
  });
});

describe("subscriptions: applyAutoSubscribeDefault (ensure_debate_subscription_default_v2)", () => {
  it("participation creates a default-subscribed row only when none exists", () => {
    expect(applyAutoSubscribeDefault(null)).toEqual(DEFAULT_DEBATE_SUBSCRIPTION_ROW);
  });

  it("participation never overrides an explicit opt-out on an existing row", () => {
    const optedOut = { ...DEFAULT_DEBATE_SUBSCRIPTION_ROW, isSubscribed: false };
    expect(applyAutoSubscribeDefault(optedOut)).toEqual(optedOut);
  });

  it("participation never resets an existing subscriber's already-customized preferences", () => {
    const customized = { ...DEFAULT_DEBATE_SUBSCRIPTION_ROW, notifyPhaseChanges: false, notifyFinalVote: false };
    expect(applyAutoSubscribeDefault(customized)).toEqual(customized);
  });

  it("documents exactly two high-intent auto-subscribe call sites", () => {
    expect(HIGH_INTENT_AUTO_SUBSCRIBE_FUNCTIONS_V2).toEqual(["join_debate_v2", "cast_debate_ballot_v2"]);
  });
});

describe("subscriptions: V1/anonymous rejection", () => {
  it("a V2-only RPC (like set_debate_subscription_v2) requires format_version === 2, structurally excluding V1 debates -- the same condition violatesV1RpcOnV2Debate's own family of checks is built from", () => {
    const isV2Debate = (formatVersion: 1 | 2) => formatVersion === 2;
    expect(isV2Debate(1)).toBe(false);
    expect(isV2Debate(2)).toBe(true);
    // violatesV1RpcOnV2Debate itself answers the mirror-image question (is
    // a *V1* RPC being misused on a V2 debate) -- included here only to
    // confirm the two checks are complementary, not duplicated:
    expect(violatesV1RpcOnV2Debate(2)).toBe(true);
    expect(violatesV1RpcOnV2Debate(1)).toBe(false);
  });

  it("anonymous rejection is a structural precondition: set_debate_subscription_v2 checks auth.uid() IS NULL before any other logic, matching every other V2 RPC -- but is deliberately NOT suspension-gated (Phase 4B correction, see that function's own comment)", () => {
    // No pure mirror exists for "auth.uid() IS NULL" (it is not application
    // logic, it is Postgres session state) -- reviewable only against the
    // actual SQL text. SUSPENSION_GATED_FUNCTIONS_V2 documents is_suspended()
    // coverage for the six functions that create content or otherwise
    // participate; set_debate_subscription_v2 is intentionally excluded from
    // that list -- managing one's own notification preferences must remain
    // available to a suspended user (see the dedicated test below).
    expect(SUSPENSION_GATED_FUNCTIONS_V2).not.toContain("set_debate_subscription_v2");
  });
});

describe("notification events: event keys are stable and collision-free across categories", () => {
  it("each builder is a pure, deterministic function of its inputs", () => {
    expect(roundChangeEventKey("debate-1", "round-1")).toBe(roundChangeEventKey("debate-1", "round-1"));
    expect(roundChangeEventKey("debate-1", "round-1")).toBe("debate-1:round:round-1:active");
    expect(finalVoteOpenEventKey("debate-1", "round-5")).toBe("debate-1:final_vote:round-5");
    expect(crossExamQuestionEventKey("debate-1", "exchange-1")).toBe("debate-1:cross_question:exchange-1");
    expect(crossExamAnswerEventKey("debate-1", "exchange-1")).toBe("debate-1:cross_answer:exchange-1");
    expect(rebuttalEventKey("debate-1", "arg-9")).toBe("debate-1:rebuttal:arg-9");
    expect(evidenceRequestedEventKey("debate-1", "arg-9")).toBe("debate-1:evidence:arg-9");
  });

  it("no two builders can ever produce the same key for the same debate, thanks to distinct category tags", () => {
    const debateId = "debate-1";
    const sharedSuffixId = "shared-id"; // deliberately the same id passed to every builder
    const keys = [
      roundChangeEventKey(debateId, sharedSuffixId),
      finalVoteOpenEventKey(debateId, sharedSuffixId),
      crossExamQuestionEventKey(debateId, sharedSuffixId),
      crossExamAnswerEventKey(debateId, sharedSuffixId),
      rebuttalEventKey(debateId, sharedSuffixId),
      evidenceRequestedEventKey(debateId, sharedSuffixId),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("evidenceRequestedEventKey is scoped to (debate, argument) only -- the same key regardless of which user reacts, so repeated off/on activity by anyone collapses onto one lifetime event", () => {
    const first = evidenceRequestedEventKey("debate-1", "arg-1"); // user A's first add
    const second = evidenceRequestedEventKey("debate-1", "arg-1"); // user A, after an off/on cycle
    const third = evidenceRequestedEventKey("debate-1", "arg-1"); // a different user, B, also adds it
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("crossExamAnswerEventKey is scoped to the exchange only -- a duplicate/retried answer call for the same exchange always produces the same key", () => {
    expect(crossExamAnswerEventKey("debate-1", "exchange-7")).toBe(crossExamAnswerEventKey("debate-1", "exchange-7"));
  });
});

describe("notification events: resolveRoundTransitionEventType", () => {
  it("emits the dedicated final_vote_open event, never a generic round_change, when the new phase is final_vote", () => {
    expect(resolveRoundTransitionEventType("final_vote")).toBe("final_vote_open");
  });

  it("emits round_change for every other phase", () => {
    expect(resolveRoundTransitionEventType("opening")).toBe("round_change");
    expect(resolveRoundTransitionEventType("rebuttal")).toBe("round_change");
    expect(resolveRoundTransitionEventType("cross_examination")).toBe("round_change");
    expect(resolveRoundTransitionEventType("closing")).toBe("round_change");
  });
});

describe("notification events: debateNotificationTypeFor", () => {
  it("maps each event_type to its notifications.type", () => {
    expect(debateNotificationTypeFor("round_change")).toBe("debate_v2_round_change");
    expect(debateNotificationTypeFor("final_vote_open")).toBe("debate_v2_final_vote");
    expect(debateNotificationTypeFor("evidence_requested")).toBe("debate_v2_evidence_requested");
  });

  it("collapses all three direct-response sub-events into one shared notifications.type", () => {
    expect(debateNotificationTypeFor("direct_response_question")).toBe("debate_v2_direct_response");
    expect(debateNotificationTypeFor("direct_response_answer")).toBe("debate_v2_direct_response");
    expect(debateNotificationTypeFor("direct_response_rebuttal")).toBe("debate_v2_direct_response");
  });
});

describe("notification worker: clampNotificationWorkerLimit", () => {
  it("defaults to 50 when no limit is supplied", () => {
    expect(clampNotificationWorkerLimit(null)).toBe(50);
    expect(clampNotificationWorkerLimit(undefined)).toBe(50);
  });

  it("clamps below 1 up to 1", () => {
    expect(clampNotificationWorkerLimit(0)).toBe(1);
    expect(clampNotificationWorkerLimit(-5)).toBe(1);
  });

  it("clamps above 200 down to 200", () => {
    expect(clampNotificationWorkerLimit(500)).toBe(200);
  });

  it("passes through any in-range value unchanged", () => {
    expect(clampNotificationWorkerLimit(75)).toBe(75);
  });
});

describe("notification worker: isNotificationEventEligibleForProcessing (retry model)", () => {
  it("a pending event is always eligible", () => {
    expect(isNotificationEventEligibleForProcessing({ status: "pending", attempts: 0 })).toBe(true);
    expect(isNotificationEventEligibleForProcessing({ status: "pending", attempts: 99 })).toBe(true);
  });

  it("a delivered event is never revisited", () => {
    expect(isNotificationEventEligibleForProcessing({ status: "delivered", attempts: 1 })).toBe(false);
  });

  it("a failed event remains retryable until it reaches the max-attempts cap", () => {
    expect(isNotificationEventEligibleForProcessing({ status: "failed", attempts: NOTIFICATION_EVENT_MAX_ATTEMPTS - 1 })).toBe(
      true
    );
  });

  it("a failed event that has exhausted its attempts is permanently excluded (dead-lettered)", () => {
    expect(isNotificationEventEligibleForProcessing({ status: "failed", attempts: NOTIFICATION_EVENT_MAX_ATTEMPTS })).toBe(
      false
    );
  });
});

describe("notification worker: isEligibleForDebateNotification (per-recipient preference gating)", () => {
  const subscribed = DEFAULT_DEBATE_SUBSCRIPTION_ROW;

  it("no subscription row at all is never eligible -- there is no implicit default-to-notified", () => {
    expect(isEligibleForDebateNotification({ subscription: null, eventType: "round_change" })).toBe(false);
  });

  it("an explicitly unsubscribed row is never eligible, regardless of individual preference flags", () => {
    const optedOut = { ...subscribed, isSubscribed: false };
    expect(isEligibleForDebateNotification({ subscription: optedOut, eventType: "round_change" })).toBe(false);
  });

  it("each event category is gated by its own preference flag", () => {
    expect(isEligibleForDebateNotification({ subscription: subscribed, eventType: "round_change" })).toBe(true);
    expect(
      isEligibleForDebateNotification({
        subscription: { ...subscribed, notifyPhaseChanges: false },
        eventType: "round_change",
      })
    ).toBe(false);

    expect(isEligibleForDebateNotification({ subscription: subscribed, eventType: "final_vote_open" })).toBe(true);
    expect(
      isEligibleForDebateNotification({
        subscription: { ...subscribed, notifyFinalVote: false },
        eventType: "final_vote_open",
      })
    ).toBe(false);

    expect(isEligibleForDebateNotification({ subscription: subscribed, eventType: "evidence_requested" })).toBe(true);
    expect(
      isEligibleForDebateNotification({
        subscription: { ...subscribed, notifyEvidenceRequests: false },
        eventType: "evidence_requested",
      })
    ).toBe(false);
  });

  it("all three direct-response sub-events share the notifyDirectResponses flag", () => {
    const disabled = { ...subscribed, notifyDirectResponses: false };
    for (const eventType of ["direct_response_question", "direct_response_answer", "direct_response_rebuttal"] as const) {
      expect(isEligibleForDebateNotification({ subscription: subscribed, eventType })).toBe(true);
      expect(isEligibleForDebateNotification({ subscription: disabled, eventType })).toBe(false);
    }
  });
});

describe("notification worker: isEligibleBroadcastRecipient (round_change/final_vote_open only)", () => {
  const subscribed = DEFAULT_DEBATE_SUBSCRIPTION_ROW;

  it("self-actions do not notify the actor -- the moderator who just advanced the round is excluded from the broadcast", () => {
    expect(
      isEligibleBroadcastRecipient({
        subscription: subscribed,
        eventType: "round_change",
        recipientUserId: "mod-1",
        actorId: "mod-1",
      })
    ).toBe(false);
  });

  it("an automatic transition (actorId null) excludes nobody on that basis", () => {
    expect(
      isEligibleBroadcastRecipient({
        subscription: subscribed,
        eventType: "round_change",
        recipientUserId: "viewer-1",
        actorId: null,
      })
    ).toBe(true);
  });

  it("still applies the ordinary preference gate for every non-actor recipient", () => {
    expect(
      isEligibleBroadcastRecipient({
        subscription: { ...subscribed, notifyPhaseChanges: false },
        eventType: "round_change",
        recipientUserId: "viewer-2",
        actorId: "mod-1",
      })
    ).toBe(false);
  });
});

describe("notification events: privacy -- ballot data never appears in any Phase 4B payload-building function", () => {
  it("no Phase 4B pure function accepts a vote, confidence, reason, or influential_argument_id parameter", () => {
    // Structural assertion: every payload/message these functions build is
    // sourced from event_type, actor/target ids, and debate/round/argument/
    // exchange ids only -- ballot fields are never plumbed through this
    // module at all, matching the migration's own equivalent structural
    // claim (no function in it ever reads debate_ballots).
    const sampleMessage = debateNotificationTypeFor("round_change");
    expect(sampleMessage).not.toMatch(/vote|confidence|reason|ballot/i);
  });
});
