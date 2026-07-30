import { describe, expect, it } from "vitest";
import {
  resolveDebateV15Guidance,
  type DebateV15GuidanceInput,
} from "./roomGuidance";

function guidance(overrides: Partial<DebateV15GuidanceInput> = {}) {
  return resolveDebateV15Guidance({
    role: "reader",
    phase: "opening",
    deadlinePassed: false,
    bothDebatersAccepted: true,
    viewerHasSubmitted: false,
    missingSides: [],
    viewerHasVoted: false,
    ...overrides,
  });
}

describe("who is being asked to act", () => {
  it("calls a debater to write during their own submission phase", () => {
    const result = guidance({ role: "debater", phase: "rebuttal" });

    expect(result.tone).toBe("action");
    expect(result.heading).toContain("Your turn");
    expect(result.body).toContain("200 words");
  });

  it("does not ask a reader to act during a submission phase", () => {
    expect(guidance({ role: "reader", phase: "rebuttal" }).tone).toBe("waiting");
  });

  it("does not ask a debater to act again once they have submitted", () => {
    const result = guidance({
      role: "debater",
      phase: "opening",
      viewerHasSubmitted: true,
    });

    expect(result.tone).toBe("waiting");
    expect(result.heading).toContain("is in");
  });

  it("asks the moderator to advance only once both sides are in", () => {
    expect(
      guidance({ role: "moderator", phase: "opening", missingSides: [] }).tone
    ).toBe("action");
    expect(
      guidance({
        role: "moderator",
        phase: "opening",
        missingSides: ["against"],
      }).tone
    ).toBe("waiting");
  });

  it("names who the moderator is waiting on", () => {
    const result = guidance({
      role: "moderator",
      phase: "rebuttal",
      missingSides: ["for", "against"],
    });

    expect(result.heading).toContain("FOR and AGAINST");
  });
});

describe("deadlines that have gone by", () => {
  it("warns a debater without pretending their draft is lost", () => {
    const result = guidance({
      role: "debater",
      phase: "opening",
      deadlinePassed: true,
    });

    expect(result.tone).toBe("warning");
    expect(result.body).toContain("still saved");
  });

  it("does not warn a debater who already submitted", () => {
    expect(
      guidance({
        role: "debater",
        phase: "opening",
        deadlinePassed: true,
        viewerHasSubmitted: true,
      }).tone
    ).toBe("waiting");
  });

  it("tells the moderator a missed deadline is theirs to resolve", () => {
    const result = guidance({
      role: "moderator",
      phase: "opening",
      deadlinePassed: true,
      missingSides: ["for"],
    });

    expect(result.tone).toBe("warning");
    expect(result.body).toContain("Extend");
  });
});

describe("recruiting", () => {
  it("asks an invitee to answer, and states what accepting commits them to", () => {
    const result = guidance({ role: "invitee", phase: "recruiting" });

    expect(result.tone).toBe("action");
    expect(result.body).toContain("locked");
  });

  it("tells a confirmed debater there is nothing to do yet", () => {
    expect(
      guidance({
        role: "debater",
        phase: "recruiting",
        bothDebatersAccepted: false,
      }).tone
    ).toBe("waiting");
  });

  it("only invites the moderator to start once both sides accepted", () => {
    expect(
      guidance({
        role: "moderator",
        phase: "recruiting",
        bothDebatersAccepted: false,
      }).heading
    ).toContain("Confirm");
    expect(
      guidance({
        role: "moderator",
        phase: "recruiting",
        bothDebatersAccepted: true,
      }).heading
    ).toContain("can start");
  });
});

describe("the vote that actually decides it", () => {
  it("tells a reader their vote is the deciding one, not the upvotes", () => {
    const result = guidance({ role: "reader", phase: "voting" });

    expect(result.tone).toBe("action");
    expect(result.body).toContain("Upvotes");
    expect(result.body).toContain("settle nothing");
  });

  it("asks a guest to sign in rather than silently offering nothing", () => {
    const result = guidance({ role: "guest", phase: "voting" });

    expect(result.tone).toBe("action");
    expect(result.heading).toContain("Sign in");
  });

  it("stops asking once the viewer has voted", () => {
    expect(
      guidance({ role: "reader", phase: "voting", viewerHasVoted: true }).tone
    ).toBe("waiting");
  });

  it("tells a debater they now vote like any other member", () => {
    expect(guidance({ role: "debater", phase: "voting" }).body).toContain(
      "same as any reader"
    );
  });
});

describe("completed", () => {
  it("says the same closing thing to everyone", () => {
    for (const role of ["moderator", "debater", "reader", "guest"] as const) {
      const result = guidance({ role, phase: "completed" });
      expect(result.tone).toBe("waiting");
      expect(result.heading).toContain("verdict");
    }
  });
});
