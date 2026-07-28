import { describe, expect, it } from "vitest";
import {
  DEBATE_V15_MAX_SOURCES,
  DEBATE_V15_PHASE_ORDER,
  areDebateV15DeadlinesStrictlyIncreasing,
  canCastDebateV15FinalVote,
  canSubmitDebateV15Argument,
  countDebateV15Words,
  debateV15RoundNumber,
  hasBothAcceptedDebateV15Slots,
  isDebateV15ArgumentWithinLimit,
  isDebateV15DeadlineOpen,
  isManualDebateV15Transition,
  isValidDebateV15SourceUrl,
  nextDebateV15Phase,
  resolveDebateV15Verdict,
} from "./debateV15";

const now = new Date("2026-07-28T12:00:00.000Z");
const future = "2026-07-29T12:00:00.000Z";

describe("Debate V1.5 lifecycle", () => {
  it("uses the manual pilot phase order with no closing round", () => {
    expect(DEBATE_V15_PHASE_ORDER).toEqual([
      "recruiting",
      "opening",
      "rebuttal",
      "voting",
      "completed",
    ]);
    expect(nextDebateV15Phase("rebuttal")).toBe("voting");
    expect(nextDebateV15Phase("completed")).toBeNull();
  });

  it("allows exactly the four forward transitions", () => {
    expect(isManualDebateV15Transition("recruiting", "opening")).toBe(true);
    expect(isManualDebateV15Transition("opening", "rebuttal")).toBe(true);
    expect(isManualDebateV15Transition("rebuttal", "voting")).toBe(true);
    expect(isManualDebateV15Transition("voting", "completed")).toBe(true);
    expect(isManualDebateV15Transition("opening", "voting")).toBe(false);
  });

  it("requires one accepted slot on each side", () => {
    expect(
      hasBothAcceptedDebateV15Slots([
        { stance: "for", status: "accepted" },
        { stance: "against", status: "accepted" },
      ])
    ).toBe(true);
    expect(
      hasBothAcceptedDebateV15Slots([
        { stance: "for", status: "accepted" },
        { stance: "against", status: "invited" },
      ])
    ).toBe(false);
  });
});

describe("Debate V1.5 deadlines", () => {
  it("treats the exact deadline instant as open and the next instant as closed", () => {
    expect(isDebateV15DeadlineOpen(now, now)).toBe(true);
    expect(
      isDebateV15DeadlineOpen(now, new Date(now.getTime() + 1))
    ).toBe(false);
    expect(isDebateV15DeadlineOpen(null, now)).toBe(false);
  });

  it("requires four future, strictly increasing deadlines", () => {
    expect(
      areDebateV15DeadlinesStrictlyIncreasing(
        {
          recruiting: "2026-07-29T00:00:00Z",
          opening: "2026-07-30T00:00:00Z",
          rebuttal: "2026-07-31T00:00:00Z",
          voting: "2026-08-01T00:00:00Z",
        },
        now
      )
    ).toBe(true);
    expect(
      areDebateV15DeadlinesStrictlyIncreasing(
        {
          recruiting: "2026-07-29T00:00:00Z",
          opening: "2026-07-29T00:00:00Z",
          rebuttal: "2026-07-31T00:00:00Z",
          voting: "2026-08-01T00:00:00Z",
        },
        now
      )
    ).toBe(false);
  });
});

describe("Debate V1.5 argument contract", () => {
  it("matches SQL whitespace word counting and phase limits", () => {
    expect(countDebateV15Words("  one\n two\tthree  ")).toBe(3);
    expect(countDebateV15Words("   ")).toBe(0);
    expect(isDebateV15ArgumentWithinLimit("opening", "word ".repeat(300))).toBe(
      true
    );
    expect(isDebateV15ArgumentWithinLimit("opening", "word ".repeat(301))).toBe(
      false
    );
    expect(isDebateV15ArgumentWithinLimit("rebuttal", "word ".repeat(201))).toBe(
      false
    );
  });

  it("derives round number only from the phase", () => {
    expect(debateV15RoundNumber("opening")).toBe(1);
    expect(debateV15RoundNumber("rebuttal")).toBe(2);
  });

  it("accepts only http(s) source URLs", () => {
    expect(isValidDebateV15SourceUrl("https://example.com/source")).toBe(true);
    expect(isValidDebateV15SourceUrl("http://example.com")).toBe(true);
    expect(isValidDebateV15SourceUrl("javascript:alert(1)")).toBe(false);
    expect(isValidDebateV15SourceUrl("example.com")).toBe(false);
  });

  it("requires phase, deadline, accepted slot, one-shot submission and source limits together", () => {
    const input = {
      debateStatus: "active" as const,
      currentPhase: "opening" as const,
      expectedPhase: "opening" as const,
      deadline: future,
      slotStatus: "accepted" as const,
      existingSubmissionCount: 0,
      content: "A supported opening argument.",
      sources: ["https://example.com"],
      now,
    };
    expect(canSubmitDebateV15Argument(input)).toBe(true);
    expect(
      canSubmitDebateV15Argument({ ...input, existingSubmissionCount: 1 })
    ).toBe(false);
    expect(
      canSubmitDebateV15Argument({
        ...input,
        sources: Array(DEBATE_V15_MAX_SOURCES + 1).fill("https://example.com"),
      })
    ).toBe(false);
    expect(
      canSubmitDebateV15Argument({ ...input, deadline: now, now: new Date(now.getTime() + 1) })
    ).toBe(false);
  });
});

describe("Debate V1.5 final vote contract", () => {
  it("requires active voting and an open voting deadline", () => {
    expect(
      canCastDebateV15FinalVote({
        debateStatus: "active",
        currentPhase: "voting",
        votingDeadline: future,
        now,
      })
    ).toBe(true);
    expect(
      canCastDebateV15FinalVote({
        debateStatus: "active",
        currentPhase: "rebuttal",
        votingDeadline: future,
        now,
      })
    ).toBe(false);
    expect(
      canCastDebateV15FinalVote({
        debateStatus: "closed",
        currentPhase: "completed",
        votingDeadline: future,
        now,
      })
    ).toBe(false);
  });

  it("reports no-vote, tied, FOR, and AGAINST verdicts honestly", () => {
    expect(resolveDebateV15Verdict(0, 0)).toEqual({
      total: 0,
      forPercent: 0,
      againstPercent: 0,
      outcome: "no_votes",
    });
    expect(resolveDebateV15Verdict(2, 2).outcome).toBe("tied");
    expect(resolveDebateV15Verdict(3, 1)).toEqual({
      total: 4,
      forPercent: 75,
      againstPercent: 25,
      outcome: "for",
    });
    expect(resolveDebateV15Verdict(1, 3).outcome).toBe("against");
  });
});
