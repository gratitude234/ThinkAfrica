import { describe, expect, it } from "vitest";
import {
  debateV15SignalFromRoom,
  debateV15SignalsDiffer,
  type DebateV15RoomSignal,
} from "./roomSignal";

const baseSignal: DebateV15RoomSignal = {
  status: "active",
  phase: "opening",
  recruitingDeadline: "2026-08-01T10:00:00.000Z",
  openingDeadline: "2026-08-02T10:00:00.000Z",
  rebuttalDeadline: "2026-08-03T10:00:00.000Z",
  votingDeadline: "2026-08-04T10:00:00.000Z",
  forVotes: 3,
  againstVotes: 5,
  recapStatus: null,
  cancelledAt: null,
  argumentFingerprint: "arg-1:2,arg-2:0",
  slotFingerprint: "against:accepted,for:accepted",
};

const baseRoom = {
  debate: {
    status: "active",
    phase: "opening",
    recruitingDeadline: "2026-08-01T10:00:00.000Z",
    openingDeadline: "2026-08-02T10:00:00.000Z",
    rebuttalDeadline: "2026-08-03T10:00:00.000Z",
    votingDeadline: "2026-08-04T10:00:00.000Z",
    forVotes: 3,
    againstVotes: 5,
    recapStatus: null,
    cancelledAt: null,
  },
  arguments: [
    { id: "arg-1", upvotes: 2 },
    { id: "arg-2", upvotes: 0 },
  ],
  slots: [
    { stance: "for", status: "accepted" },
    { stance: "against", status: "accepted" },
  ],
};

describe("debateV15SignalsDiffer", () => {
  it("treats an identical signal as unchanged", () => {
    expect(debateV15SignalsDiffer(baseSignal, { ...baseSignal })).toBe(false);
  });

  it.each([
    ["phase", { phase: "rebuttal" }],
    ["status", { status: "closed" }],
    ["an extended deadline", { openingDeadline: "2026-08-02T18:00:00.000Z" }],
    ["final vote counts", { forVotes: 4 }],
    ["recap readiness", { recapStatus: "ready" }],
    ["cancellation", { cancelledAt: "2026-08-02T09:00:00.000Z" }],
  ])("detects a change in %s", (_label, patch) => {
    expect(
      debateV15SignalsDiffer(baseSignal, { ...baseSignal, ...patch })
    ).toBe(true);
  });

  it("detects a newly submitted argument", () => {
    expect(
      debateV15SignalsDiffer(baseSignal, {
        ...baseSignal,
        argumentFingerprint: "arg-1:2,arg-2:0,arg-3:0",
      })
    ).toBe(true);
  });

  it("detects an upvote on an existing argument", () => {
    expect(
      debateV15SignalsDiffer(baseSignal, {
        ...baseSignal,
        argumentFingerprint: "arg-1:3,arg-2:0",
      })
    ).toBe(true);
  });

  it("detects an invitation being answered", () => {
    expect(
      debateV15SignalsDiffer(baseSignal, {
        ...baseSignal,
        slotFingerprint: "against:accepted,for:invited",
      })
    ).toBe(true);
  });
});

describe("debateV15SignalFromRoom", () => {
  it("derives a baseline that matches an unchanged server signal", () => {
    // The whole point of the seeded baseline: the first poll tick against an
    // unchanged room must not report a change, or every room would refresh
    // itself 15 seconds after load.
    expect(
      debateV15SignalsDiffer(debateV15SignalFromRoom(baseRoom), baseSignal)
    ).toBe(false);
  });

  it("orders fingerprints independently of row order", () => {
    const reordered = {
      ...baseRoom,
      arguments: [...baseRoom.arguments].reverse(),
      slots: [...baseRoom.slots].reverse(),
    };

    expect(debateV15SignalFromRoom(reordered)).toEqual(
      debateV15SignalFromRoom(baseRoom)
    );
  });

  it("reports a change when the room gains an argument", () => {
    const withNewArgument = {
      ...baseRoom,
      arguments: [...baseRoom.arguments, { id: "arg-3", upvotes: 0 }],
    };

    expect(
      debateV15SignalsDiffer(
        debateV15SignalFromRoom(baseRoom),
        debateV15SignalFromRoom(withNewArgument)
      )
    ).toBe(true);
  });
});
