import { describe, expect, it } from "vitest";
import {
  interpretRoundTransitionResult,
  isSafeSourceLinkUrl,
  isStaleTransitionOutcome,
  resolveDebateExperienceVersion,
  roomSignalsDiffer,
  sanitizeRpcErrorMessage,
  type RoomSignalLike,
} from "@/lib/debateV2Ui";

describe("resolveDebateExperienceVersion", () => {
  it("routes format_version 2 to v2", () => {
    expect(resolveDebateExperienceVersion(2)).toBe("v2");
  });

  it("routes format_version 1 to v1", () => {
    expect(resolveDebateExperienceVersion(1)).toBe("v1");
  });

  it("treats null/undefined as v1 (the column's own NOT NULL default is 1)", () => {
    expect(resolveDebateExperienceVersion(null)).toBe("v1");
    expect(resolveDebateExperienceVersion(undefined)).toBe("v1");
  });
});

describe("sanitizeRpcErrorMessage", () => {
  it("passes through a P0001 (RAISE EXCEPTION) message verbatim", () => {
    expect(sanitizeRpcErrorMessage({ code: "P0001", message: "This debate is closed." })).toBe(
      "This debate is closed."
    );
  });

  it("falls back to a generic message for a non-P0001 error", () => {
    expect(
      sanitizeRpcErrorMessage({ code: "23505", message: 'duplicate key value violates constraint "x"' })
    ).toBe("Something went wrong. Please try again.");
  });

  it("falls back to a generic message when there is no code at all (network error)", () => {
    expect(sanitizeRpcErrorMessage({ message: "Failed to fetch" })).toBe(
      "Something went wrong. Please try again."
    );
  });

  it("falls back to a generic message for a null/undefined error", () => {
    expect(sanitizeRpcErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(sanitizeRpcErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
  });

  it("falls back when a P0001 error has no message text", () => {
    expect(sanitizeRpcErrorMessage({ code: "P0001", message: null })).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("interpretRoundTransitionResult", () => {
  it("maps advance_or_close_debate_round_v2's result field", () => {
    expect(interpretRoundTransitionResult({ result: "round_advanced" })).toBe("advanced");
    expect(interpretRoundTransitionResult({ result: "debate_completed" })).toBe("completed");
    expect(interpretRoundTransitionResult({ result: "stale_no_op" })).toBe("stale");
    expect(interpretRoundTransitionResult({ result: "not_due" })).toBe("not_due");
  });

  it("maps extend_debate_round_v2's result field", () => {
    expect(interpretRoundTransitionResult({ result: "extended" })).toBe("extended");
    expect(interpretRoundTransitionResult({ result: "stale_no_op" })).toBe("stale");
  });

  it("maps start_debate_round_one_v2's already_started boolean shape", () => {
    expect(interpretRoundTransitionResult({ already_started: true })).toBe("already_started");
    expect(interpretRoundTransitionResult({ already_started: false })).toBe("started");
  });

  it("maps close_debate_v2's already_closed boolean shape", () => {
    expect(interpretRoundTransitionResult({ already_closed: true })).toBe("already_closed");
    expect(interpretRoundTransitionResult({ already_closed: false })).toBe("closed");
  });

  it("returns unknown for null/undefined/unrecognized shapes", () => {
    expect(interpretRoundTransitionResult(null)).toBe("unknown");
    expect(interpretRoundTransitionResult(undefined)).toBe("unknown");
    expect(interpretRoundTransitionResult({ foo: "bar" })).toBe("unknown");
    expect(interpretRoundTransitionResult({ result: "some_future_value" })).toBe("unknown");
  });
});

describe("isStaleTransitionOutcome", () => {
  it("treats stale and not_due as concurrency no-ops", () => {
    expect(isStaleTransitionOutcome("stale")).toBe(true);
    expect(isStaleTransitionOutcome("not_due")).toBe(true);
  });

  it("treats every other outcome as not a no-op", () => {
    for (const outcome of [
      "advanced",
      "completed",
      "started",
      "already_started",
      "closed",
      "already_closed",
      "extended",
      "unknown",
    ] as const) {
      expect(isStaleTransitionOutcome(outcome)).toBe(false);
    }
  });
});

describe("isSafeSourceLinkUrl", () => {
  it("allows http and https", () => {
    expect(isSafeSourceLinkUrl("https://example.com/article")).toBe(true);
    expect(isSafeSourceLinkUrl("http://example.com/article")).toBe(true);
  });

  it("rejects javascript: and data: protocols", () => {
    expect(isSafeSourceLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeSourceLinkUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects other non-web protocols", () => {
    expect(isSafeSourceLinkUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeSourceLinkUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeSourceLinkUrl("not a url")).toBe(false);
    expect(isSafeSourceLinkUrl("")).toBe(false);
  });
});

describe("roomSignalsDiffer", () => {
  function signal(overrides: Partial<RoomSignalLike> = {}): RoomSignalLike {
    return {
      debateStatus: "active",
      closureKind: null,
      rounds: [{ id: "round-1", status: "active", endsAt: "2026-07-17T00:30:00.000Z" }],
      argumentCount: 3,
      reactionCount: 5,
      reactionLatestCreatedAt: "2026-07-17T00:00:00.000Z",
      crossExchangeCount: 2,
      crossExchangeLatestUpdatedAt: "2026-07-17T00:00:00.000Z",
      membershipCount: 4,
      canManage: false,
      initialBallotCount: 2,
      initialBallotLatestUpdatedAt: "2026-07-17T00:00:00.000Z",
      finalBallotCount: null,
      finalBallotLatestUpdatedAt: null,
      ...overrides,
    };
  }

  it("is false for two identical signals", () => {
    expect(roomSignalsDiffer(signal(), signal())).toBe(false);
  });

  it("detects a new argument, reaction, membership, or initial-stage ballot by count alone", () => {
    expect(roomSignalsDiffer(signal(), signal({ argumentCount: 4 }))).toBe(true);
    expect(roomSignalsDiffer(signal(), signal({ reactionCount: 6 }))).toBe(true);
    expect(roomSignalsDiffer(signal(), signal({ membershipCount: 5 }))).toBe(true);
    expect(roomSignalsDiffer(signal(), signal({ initialBallotCount: 3 }))).toBe(true);
  });

  it("detects a same-tick 'one reaction removed, a different one added' that nets to no count change", () => {
    expect(roomSignalsDiffer(signal(), signal({ reactionLatestCreatedAt: "2026-07-17T00:05:00.000Z" }))).toBe(true);
  });

  it("detects a new cross-examination question by count alone", () => {
    expect(roomSignalsDiffer(signal(), signal({ crossExchangeCount: 3 }))).toBe(true);
  });

  it("detects a newly submitted cross-examination answer without the exchange count changing", () => {
    expect(
      roomSignalsDiffer(signal(), signal({ crossExchangeLatestUpdatedAt: "2026-07-17T00:05:00.000Z" }))
    ).toBe(true);
  });

  it("detects a ballot being recast in a visible stage (same count, later updated_at)", () => {
    expect(roomSignalsDiffer(signal(), signal({ initialBallotLatestUpdatedAt: "2026-07-17T00:05:00.000Z" }))).toBe(true);
  });

  it("detects a stage becoming newly visible (null -> a real count/timestamp)", () => {
    expect(
      roomSignalsDiffer(signal(), signal({ finalBallotCount: 1, finalBallotLatestUpdatedAt: "2026-07-17T00:10:00.000Z" }))
    ).toBe(true);
  });

  it("detects a moderator reassignment or editor/admin role change via can_manage, even with membership count unchanged", () => {
    expect(roomSignalsDiffer(signal({ canManage: true }), signal({ canManage: false }))).toBe(true);
  });

  it("detects a debate-level status or closure change", () => {
    expect(roomSignalsDiffer(signal(), signal({ debateStatus: "closed" }))).toBe(true);
    expect(roomSignalsDiffer(signal(), signal({ closureKind: "forced" }))).toBe(true);
  });

  it("detects a round transition (status or ends_at) even though the round count never changes", () => {
    expect(
      roomSignalsDiffer(signal(), signal({ rounds: [{ id: "round-1", status: "completed", endsAt: "2026-07-17T00:30:00.000Z" }] }))
    ).toBe(true);
    expect(
      roomSignalsDiffer(signal(), signal({ rounds: [{ id: "round-1", status: "active", endsAt: "2026-07-17T00:40:00.000Z" }] }))
    ).toBe(true);
  });
});
