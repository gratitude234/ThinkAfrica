import { describe, expect, it } from "vitest";
import {
  applyClearRelationOnParentNull,
  backfillDebateMemberships,
  checkSameDebateReference,
  dedupeDebateMembershipsByKey,
  isDebateArgumentEntryType,
  isDebateArgumentRelationType,
  isDebateBallotStage,
  isDebateBallotVote,
  isDebateMembershipRole,
  isDebateModerationTargetType,
  isDebateNotificationEventType,
  isDebateReactionType,
  isDebateRoundPhase,
  isDebateRoundStatus,
  isDebateStance,
  isValidDebateMembership,
  membershipFromModerator,
  membershipFromParticipant,
  violatesArgumentParentRelationPairing,
  violatesCrossExchangeAnswerImmutability,
  violatesCrossExchangeAnswerPairing,
  violatesCrossExchangeSelfTarget,
  violatesDebateIdImmutability,
  violatesFormatVersionGuard,
  violatesOneActiveRoundPerDebate,
  violatesRoundTiming,
  violatesSameDebateReference,
} from "@/lib/debateV2";

describe("runtime guards mirror the migration's CHECK constraints", () => {
  it("validates membership roles", () => {
    expect(isDebateMembershipRole("moderator")).toBe(true);
    expect(isDebateMembershipRole("debater")).toBe(true);
    expect(isDebateMembershipRole("juror")).toBe(true);
    expect(isDebateMembershipRole("admin")).toBe(false);
    expect(isDebateMembershipRole(null)).toBe(false);
  });

  it("validates stances", () => {
    expect(isDebateStance("for")).toBe(true);
    expect(isDebateStance("against")).toBe(true);
    expect(isDebateStance("undecided")).toBe(false);
    expect(isDebateStance(undefined)).toBe(false);
  });

  it("validates round phases", () => {
    expect(isDebateRoundPhase("cross_examination")).toBe(true);
    expect(isDebateRoundPhase("final_vote")).toBe(true);
    expect(isDebateRoundPhase("voting")).toBe(false);
  });

  it("validates round statuses", () => {
    expect(isDebateRoundStatus("scheduled")).toBe(true);
    expect(isDebateRoundStatus("active")).toBe(true);
    expect(isDebateRoundStatus("completed")).toBe(true);
    expect(isDebateRoundStatus("cancelled")).toBe(true);
    expect(isDebateRoundStatus("closed")).toBe(false);
  });

  it("validates argument relation types", () => {
    expect(isDebateArgumentRelationType("supports")).toBe(true);
    expect(isDebateArgumentRelationType("challenges")).toBe(true);
    expect(isDebateArgumentRelationType("answers")).toBe(true);
    expect(isDebateArgumentRelationType("clarifies")).toBe(true);
    expect(isDebateArgumentRelationType("rebuts")).toBe(false);
  });

  it("validates argument entry types", () => {
    expect(isDebateArgumentEntryType("opening")).toBe(true);
    expect(isDebateArgumentEntryType("claim")).toBe(true);
    expect(isDebateArgumentEntryType("cross_examination")).toBe(false);
  });

  it("validates reaction types", () => {
    for (const reaction of [
      "well_supported",
      "strong_reasoning",
      "clear",
      "strong_rebuttal",
      "fair_to_opposition",
      "changed_my_mind",
      "needs_evidence",
    ]) {
      expect(isDebateReactionType(reaction)).toBe(true);
    }
    expect(isDebateReactionType("upvote")).toBe(false);
  });

  it("validates ballot stage and vote", () => {
    expect(isDebateBallotStage("initial")).toBe(true);
    expect(isDebateBallotStage("final")).toBe(true);
    expect(isDebateBallotStage("undecided")).toBe(false);

    expect(isDebateBallotVote("for")).toBe(true);
    expect(isDebateBallotVote("against")).toBe(true);
    expect(isDebateBallotVote("undecided")).toBe(true);
    expect(isDebateBallotVote("abstain")).toBe(false);
  });

  it("validates moderation target types", () => {
    for (const target of [
      "debate",
      "membership",
      "round",
      "argument",
      "source",
      "reaction",
      "ballot",
    ]) {
      expect(isDebateModerationTargetType(target)).toBe(true);
    }
    expect(isDebateModerationTargetType("profile")).toBe(false);
  });
});

describe("debate_memberships_stance_matches_role (constraint logic)", () => {
  it("requires a debater to have a stance", () => {
    expect(isValidDebateMembership("debater", "for")).toBe(true);
    expect(isValidDebateMembership("debater", "against")).toBe(true);
    expect(isValidDebateMembership("debater", null)).toBe(false);
  });

  it("forbids a stance for non-debater roles", () => {
    expect(isValidDebateMembership("moderator", null)).toBe(true);
    expect(isValidDebateMembership("juror", null)).toBe(true);
    expect(isValidDebateMembership("moderator", "for")).toBe(false);
    expect(isValidDebateMembership("juror", "against")).toBe(false);
  });
});

describe("debate_rounds_ends_after_starts (constraint logic)", () => {
  it("passes when either bound is absent", () => {
    expect(violatesRoundTiming(null, null)).toBe(false);
    expect(violatesRoundTiming("2026-07-18T00:00:00Z", null)).toBe(false);
    expect(violatesRoundTiming(null, "2026-07-18T00:00:00Z")).toBe(false);
  });

  it("passes when ends_at is strictly after starts_at", () => {
    expect(
      violatesRoundTiming("2026-07-18T00:00:00Z", "2026-07-18T00:10:00Z")
    ).toBe(false);
  });

  it("rejects ends_at equal to or before starts_at", () => {
    expect(
      violatesRoundTiming("2026-07-18T00:10:00Z", "2026-07-18T00:10:00Z")
    ).toBe(true);
    expect(
      violatesRoundTiming("2026-07-18T00:10:00Z", "2026-07-18T00:00:00Z")
    ).toBe(true);
  });
});

describe("debate_rounds_one_active_per_debate (partial unique index logic)", () => {
  it("passes with zero or one active round per debate", () => {
    expect(
      violatesOneActiveRoundPerDebate([
        { debate_id: "d1", status: "scheduled" },
        { debate_id: "d1", status: "active" },
        { debate_id: "d2", status: "active" },
      ])
    ).toBe(false);
  });

  it("rejects two active rounds on the same debate", () => {
    expect(
      violatesOneActiveRoundPerDebate([
        { debate_id: "d1", status: "active" },
        { debate_id: "d1", status: "active" },
      ])
    ).toBe(true);
  });

  it("allows two active rounds as long as they belong to different debates", () => {
    expect(
      violatesOneActiveRoundPerDebate([
        { debate_id: "d1", status: "active" },
        { debate_id: "d2", status: "active" },
      ])
    ).toBe(false);
  });
});

describe("debate_memberships backfill (ported from SQL for testability)", () => {
  it("turns every debate_participants row into a debater membership, unchanged", () => {
    const rows = backfillDebateMemberships(
      [
        { debate_id: "d1", user_id: "u1", stance: "for", joined_at: "2026-01-01T00:00:00Z" },
        { debate_id: "d1", user_id: "u2", stance: "against", joined_at: "2026-01-02T00:00:00Z" },
      ],
      []
    );

    expect(rows).toEqual([
      { debate_id: "d1", user_id: "u1", role: "debater", stance: "for", joined_at: "2026-01-01T00:00:00Z" },
      { debate_id: "d1", user_id: "u2", role: "debater", stance: "against", joined_at: "2026-01-02T00:00:00Z" },
    ]);
  });

  it("turns every debate with a moderator_id into a moderator membership with a null stance", () => {
    const rows = backfillDebateMemberships([], [
      { id: "d1", moderator_id: "u9", created_at: "2026-01-01T00:00:00Z" },
    ]);

    expect(rows).toEqual([
      { debate_id: "d1", user_id: "u9", role: "moderator", stance: null, joined_at: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("skips debates with no moderator_id", () => {
    const rows = backfillDebateMemberships([], [
      { id: "d1", moderator_id: null, created_at: "2026-01-01T00:00:00Z" },
    ]);

    expect(rows).toEqual([]);
  });

  it("represents a moderator who is also a debater as two distinct membership rows", () => {
    const rows = backfillDebateMemberships(
      [{ debate_id: "d1", user_id: "u1", stance: "for", joined_at: "2026-01-01T00:00:00Z" }],
      [{ id: "d1", moderator_id: "u1", created_at: "2025-12-31T00:00:00Z" }]
    );

    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      debate_id: "d1", user_id: "u1", role: "debater", stance: "for", joined_at: "2026-01-01T00:00:00Z",
    });
    expect(rows).toContainEqual({
      debate_id: "d1", user_id: "u1", role: "moderator", stance: null, joined_at: "2025-12-31T00:00:00Z",
    });
  });

  it("produces only memberships that satisfy the stance/role constraint", () => {
    const rows = backfillDebateMemberships(
      [
        { debate_id: "d1", user_id: "u1", stance: "for", joined_at: "2026-01-01T00:00:00Z" },
        { debate_id: "d2", user_id: "u2", stance: "against", joined_at: "2026-01-01T00:00:00Z" },
      ],
      [{ id: "d3", moderator_id: "u3", created_at: "2026-01-01T00:00:00Z" }]
    );

    for (const row of rows) {
      expect(isValidDebateMembership(row.role, row.stance)).toBe(true);
    }
  });
});

describe("backfill conflict-safety (ON CONFLICT DO NOTHING semantics)", () => {
  it("keeps the first row and drops later rows sharing the same (debate_id, user_id, role) key", () => {
    const rows = backfillDebateMemberships(
      [{ debate_id: "d1", user_id: "u1", stance: "for", joined_at: "2026-01-01T00:00:00Z" }],
      [{ id: "d1", moderator_id: "u1", created_at: "2025-12-31T00:00:00Z" }]
    );

    // Simulate re-running the backfill against an already-migrated database:
    // the same rows would be produced again, but the composite primary key
    // means only the first occurrence of each key should survive.
    const rerun = [...rows, ...rows];
    const deduped = dedupeDebateMembershipsByKey(rerun);

    expect(deduped).toEqual(rows);
  });

  it("does not collapse rows that share a debate and user but differ by role", () => {
    const debaterRow = {
      debate_id: "d1", user_id: "u1", role: "debater" as const, stance: "for" as const, joined_at: "t1",
    };
    const moderatorRow = {
      debate_id: "d1", user_id: "u1", role: "moderator" as const, stance: null, joined_at: "t2",
    };

    expect(dedupeDebateMembershipsByKey([debaterRow, moderatorRow])).toEqual([
      debaterRow,
      moderatorRow,
    ]);
  });
});

describe("hardening pass: debate_arguments_parent_relation_pairing_check", () => {
  it("passes when both parent_argument_id and relation_type are null", () => {
    expect(violatesArgumentParentRelationPairing(null, null)).toBe(false);
  });

  it("passes when both are set", () => {
    expect(violatesArgumentParentRelationPairing("arg-1", "supports")).toBe(false);
  });

  it("rejects a relation_type with no parent_argument_id", () => {
    expect(violatesArgumentParentRelationPairing(null, "supports")).toBe(true);
  });

  it("rejects a parent_argument_id with no relation_type", () => {
    expect(violatesArgumentParentRelationPairing("arg-1", null)).toBe(true);
  });
});

describe("hardening pass: same-debate referential integrity", () => {
  // Shared by debate_arguments_check_same_debate() (round_id and
  // parent_argument_id) and debate_ballots_check_same_debate()
  // (influential_argument_id) -- exercised generically here since the SQL
  // logic is identical for all three.

  it("skips the check entirely when the reference is null", () => {
    expect(checkSameDebateReference(null, "any-debate", "d1")).toBe("not_referenced");
    expect(violatesSameDebateReference(null, "any-debate", "d1")).toBe(false);
  });

  it("rejects a reference to a row that does not exist", () => {
    expect(checkSameDebateReference("round-1", null, "d1")).toBe("not_found");
    expect(checkSameDebateReference("round-1", undefined, "d1")).toBe("not_found");
    expect(violatesSameDebateReference("round-1", null, "d1")).toBe(true);
  });

  it("rejects a reference to a row belonging to a different debate", () => {
    expect(checkSameDebateReference("round-1", "d2", "d1")).toBe("different_debate");
    expect(violatesSameDebateReference("round-1", "d2", "d1")).toBe(true);
  });

  it("passes a reference to a row belonging to the same debate", () => {
    expect(checkSameDebateReference("round-1", "d1", "d1")).toBe("ok");
    expect(violatesSameDebateReference("round-1", "d1", "d1")).toBe(false);
  });

  it("applies identically to round_id, parent_argument_id, and influential_argument_id", () => {
    // round_id: an argument's round belongs to a different debate.
    expect(violatesSameDebateReference("round-1", "debate-B", "debate-A")).toBe(true);
    // parent_argument_id: the parent argument belongs to a different debate.
    expect(violatesSameDebateReference("parent-arg-1", "debate-B", "debate-A")).toBe(true);
    // influential_argument_id: the cited argument belongs to a different debate.
    expect(violatesSameDebateReference("arg-1", "debate-B", "debate-A")).toBe(true);
  });
});

describe("hardening pass: debates_guard_format_version", () => {
  it("blocks an authenticated client inserting format_version = 2", () => {
    expect(violatesFormatVersionGuard("INSERT", "authenticated", 2)).toBe(true);
  });

  it("allows an authenticated client inserting format_version = 1", () => {
    expect(violatesFormatVersionGuard("INSERT", "authenticated", 1)).toBe(false);
  });

  it("allows format_version = 2 on insert from service_role or a direct SQL/migration connection", () => {
    expect(violatesFormatVersionGuard("INSERT", "service_role", 2)).toBe(false);
    expect(violatesFormatVersionGuard("INSERT", null, 2)).toBe(false);
  });
});

describe("correction pass: debates_guard_format_version blocks changes in either direction", () => {
  it("still blocks an authenticated client's UPDATE from 1 to 2", () => {
    expect(violatesFormatVersionGuard("UPDATE", "authenticated", 2, 1)).toBe(true);
  });

  it("now also blocks an authenticated client's UPDATE from 2 to 1", () => {
    // The original hardening-pass version only checked NEW.format_version = 2,
    // so this direction was left open. This is the gap the correction pass closes.
    expect(violatesFormatVersionGuard("UPDATE", "authenticated", 1, 2)).toBe(true);
  });

  it("allows an UPDATE that leaves format_version unchanged", () => {
    expect(violatesFormatVersionGuard("UPDATE", "authenticated", 1, 1)).toBe(false);
    expect(violatesFormatVersionGuard("UPDATE", "authenticated", 2, 2)).toBe(false);
  });

  it("a plain debate-creation insert resolving to the column DEFAULT still works", () => {
    // app/(main)/debates/create/page.tsx never sets format_version, so it
    // resolves to the column's DEFAULT 1 by the time the trigger sees NEW.
    expect(violatesFormatVersionGuard("INSERT", "authenticated", 1)).toBe(false);
  });

  it("allows any UPDATE direction from service_role or a direct SQL/migration connection", () => {
    expect(violatesFormatVersionGuard("UPDATE", "service_role", 1, 2)).toBe(false);
    expect(violatesFormatVersionGuard("UPDATE", null, 2, 1)).toBe(false);
  });
});

describe("hardening pass: membership sync triggers (single-row shape)", () => {
  it("membershipFromParticipant matches the debater row backfillDebateMemberships produces", () => {
    const participant = {
      debate_id: "d1", user_id: "u1", stance: "for" as const, joined_at: "2026-01-01T00:00:00Z",
    };
    expect(membershipFromParticipant(participant)).toEqual({
      debate_id: "d1", user_id: "u1", role: "debater", stance: "for", joined_at: "2026-01-01T00:00:00Z",
    });
  });

  it("membershipFromModerator matches the moderator row backfillDebateMemberships produces", () => {
    const debate = { id: "d1", moderator_id: "u9", created_at: "2026-01-01T00:00:00Z" };
    expect(membershipFromModerator(debate)).toEqual({
      debate_id: "d1", user_id: "u9", role: "moderator", stance: null, joined_at: "2026-01-01T00:00:00Z",
    });
  });

  it("membershipFromModerator mirrors the trigger's NEW.moderator_id IS NOT NULL guard", () => {
    expect(membershipFromModerator({ id: "d1", moderator_id: null, created_at: "t" })).toBeNull();
  });

  it("a row synced one-at-a-time is identical to the corresponding backfilled row", () => {
    const participant = {
      debate_id: "d1", user_id: "u1", stance: "against" as const, joined_at: "2026-02-01T00:00:00Z",
    };
    const debate = { id: "d2", moderator_id: "u2", created_at: "2026-02-02T00:00:00Z" };

    const [backfilledParticipantRow] = backfillDebateMemberships([participant], []);
    const [backfilledModeratorRow] = backfillDebateMemberships([], [debate]);

    expect(membershipFromParticipant(participant)).toEqual(backfilledParticipantRow);
    expect(membershipFromModerator(debate)).toEqual(backfilledModeratorRow);
  });
});

describe("correction pass: debate_id immutability (debate_rounds/debate_arguments/debate_ballots)", () => {
  it("passes when debate_id is unchanged", () => {
    expect(violatesDebateIdImmutability("d1", "d1")).toBe(false);
  });

  it("rejects any change to debate_id", () => {
    expect(violatesDebateIdImmutability("d1", "d2")).toBe(true);
  });

  it("applies the same rule regardless of which of the three tables it came from", () => {
    // prevent_debate_id_change() is one shared SQL function attached to
    // debate_rounds, debate_arguments, and debate_ballots -- the pure port
    // is equally table-agnostic, so a single check covers all three.
    for (const [oldId, newId] of [
      ["round-debate-1", "round-debate-2"],
      ["argument-debate-1", "argument-debate-2"],
      ["ballot-debate-1", "ballot-debate-2"],
    ]) {
      expect(violatesDebateIdImmutability(oldId, newId)).toBe(true);
    }
  });
});

describe("correction pass: debate_arguments_clear_relation_on_parent_null", () => {
  it("clears relation_type when parent_argument_id transitions from set to null", () => {
    // Models the ON DELETE SET NULL cascade firing after a parent argument
    // is deleted: parent_argument_id becomes null, relation_type must follow.
    expect(applyClearRelationOnParentNull("parent-1", null, "supports")).toBeNull();
  });

  it("leaves relation_type alone when parent_argument_id does not change", () => {
    expect(applyClearRelationOnParentNull("parent-1", "parent-1", "supports")).toBe("supports");
  });

  it("leaves relation_type alone (null) when parent_argument_id was already null", () => {
    expect(applyClearRelationOnParentNull(null, null, null)).toBeNull();
  });

  it("leaves relation_type alone when parent_argument_id is newly set (not a null transition)", () => {
    expect(applyClearRelationOnParentNull(null, "parent-1", "supports")).toBe("supports");
  });

  it("the resulting pair always satisfies debate_arguments_parent_relation_pairing_check after a parent delete", () => {
    const resultingRelationType = applyClearRelationOnParentNull("parent-1", null, "supports");
    expect(violatesArgumentParentRelationPairing(null, resultingRelationType)).toBe(false);
  });
});

describe("Phase 4A: debate_cross_exchanges_answer_pairing (constraint logic)", () => {
  it("allows both answer and answered_at null (unanswered)", () => {
    expect(violatesCrossExchangeAnswerPairing(null, null)).toBe(false);
  });

  it("allows both set (answered)", () => {
    expect(violatesCrossExchangeAnswerPairing("An answer.", "2026-07-17T00:00:00.000Z")).toBe(false);
  });

  it("rejects an answer with no answered_at", () => {
    expect(violatesCrossExchangeAnswerPairing("An answer.", null)).toBe(true);
  });

  it("rejects an answered_at with no answer", () => {
    expect(violatesCrossExchangeAnswerPairing(null, "2026-07-17T00:00:00.000Z")).toBe(true);
  });
});

describe("Phase 4A: debate_cross_exchanges_asker_not_target (constraint logic)", () => {
  it("allows a different asker and target", () => {
    expect(violatesCrossExchangeSelfTarget("asker-1", "target-1")).toBe(false);
  });

  it("rejects an asker targeting themselves", () => {
    expect(violatesCrossExchangeSelfTarget("asker-1", "asker-1")).toBe(true);
  });
});

describe("Phase 4A: debate_cross_exchanges_answer_immutable_once_set (pre-apply review, defense-in-depth trigger)", () => {
  it("allows setting a first answer (null -> non-null)", () => {
    expect(violatesCrossExchangeAnswerImmutability(null, "An answer.")).toBe(false);
  });

  it("allows a no-op update that writes the same value back", () => {
    expect(violatesCrossExchangeAnswerImmutability("An answer.", "An answer.")).toBe(false);
  });

  it("rejects changing an already-set answer to a different value", () => {
    expect(violatesCrossExchangeAnswerImmutability("An answer.", "A different answer.")).toBe(true);
  });

  it("rejects clearing an already-set answer back to null", () => {
    expect(violatesCrossExchangeAnswerImmutability("An answer.", null)).toBe(true);
  });
});

describe("Phase 4B: debate_notification_events.event_type CHECK constraint", () => {
  it("accepts every one of the six documented event types", () => {
    for (const value of [
      "round_change",
      "final_vote_open",
      "direct_response_question",
      "direct_response_answer",
      "direct_response_rebuttal",
      "evidence_requested",
    ]) {
      expect(isDebateNotificationEventType(value)).toBe(true);
    }
  });

  it("rejects an unrelated string, including a plausible-looking near miss", () => {
    expect(isDebateNotificationEventType("round_changed")).toBe(false);
    expect(isDebateNotificationEventType("debate_completed")).toBe(false);
    expect(isDebateNotificationEventType("")).toBe(false);
    expect(isDebateNotificationEventType(null)).toBe(false);
    expect(isDebateNotificationEventType(undefined)).toBe(false);
  });
});
