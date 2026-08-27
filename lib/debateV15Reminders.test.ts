import { describe, expect, it } from "vitest";
import {
  planDebateV15Reminders,
  REMINDER_SOON_WINDOW_HOURS,
  type DebateV15ReminderCandidate,
} from "./debateV15Reminders";

const NOW = new Date("2026-08-01T12:00:00.000Z").getTime();

function hoursFromNow(hours: number) {
  return new Date(NOW + hours * 3_600_000).toISOString();
}

function makeCandidate(
  overrides: Partial<DebateV15ReminderCandidate> = {}
): DebateV15ReminderCandidate {
  return {
    debateId: "debate-1",
    debateTitle: "Cities should ban private cars",
    phase: "opening",
    deadline: hoursFromNow(6),
    moderatorId: "moderator-1",
    acceptedSlots: [
      { userId: "for-debater", stance: "for" },
      { userId: "against-debater", stance: "against" },
    ],
    submittedAuthorIds: [],
    ...overrides,
  };
}

describe("planDebateV15Reminders — deadline still ahead", () => {
  it("warns each debater who has not submitted yet", () => {
    const planned = planDebateV15Reminders(makeCandidate(), NOW);

    expect(planned).toHaveLength(2);
    expect(planned.every((item) => item.kind === "deadline_soon")).toBe(true);
    expect(planned.map((item) => item.recipientId).sort()).toEqual([
      "against-debater",
      "for-debater",
    ]);
  });

  it("leaves out anyone who has already submitted", () => {
    const planned = planDebateV15Reminders(
      makeCandidate({ submittedAuthorIds: ["for-debater"] }),
      NOW
    );

    expect(planned).toHaveLength(1);
    expect(planned[0].recipientId).toBe("against-debater");
  });

  it("stays quiet while the deadline is still far off", () => {
    const planned = planDebateV15Reminders(
      makeCandidate({ deadline: hoursFromNow(REMINDER_SOON_WINDOW_HOURS + 1) }),
      NOW
    );

    expect(planned).toEqual([]);
  });

  it("uses the standard 24-hour window with sub-hourly evaluation", () => {
    expect(REMINDER_SOON_WINDOW_HOURS).toBe(24);

    for (const hoursOut of [1, 6, 12, 18, 23.5]) {
      const planned = planDebateV15Reminders(
        makeCandidate({ deadline: hoursFromNow(hoursOut) }),
        NOW
      );
      expect(planned.length, `${hoursOut}h before the deadline`).toBe(2);
    }

    expect(
      planDebateV15Reminders(
        makeCandidate({ deadline: hoursFromNow(24.01) }),
        NOW
      )
    ).toEqual([]);
  });

  it("does not chase debaters during phases they cannot submit in", () => {
    for (const phase of ["recruiting", "voting"] as const) {
      expect(planDebateV15Reminders(makeCandidate({ phase }), NOW)).toEqual([]);
    }
  });

  it("reports the hours remaining so the message can state them", () => {
    const planned = planDebateV15Reminders(
      makeCandidate({ deadline: hoursFromNow(6) }),
      NOW
    );

    expect(planned[0].hoursLeft).toBeCloseTo(6, 5);
  });
});

describe("planDebateV15Reminders — deadline passed", () => {
  const overdue = { deadline: hoursFromNow(-2) };

  it("tells the moderator the room is waiting on them, naming who missed it", () => {
    const planned = planDebateV15Reminders(
      makeCandidate({ ...overdue, submittedAuthorIds: ["for-debater"] }),
      NOW
    );

    const toModerator = planned.find(
      (item) => item.kind === "deadline_missed_moderator"
    );
    expect(toModerator?.recipientId).toBe("moderator-1");
    expect(toModerator?.missingSides).toEqual(["against"]);
  });

  it("tells the debaters it is waiting on the moderator, not on them", () => {
    const planned = planDebateV15Reminders(makeCandidate(overdue), NOW);

    const participantIds = planned
      .filter((item) => item.kind === "deadline_missed_participant")
      .map((item) => item.recipientId)
      .sort();
    expect(participantIds).toEqual(["against-debater", "for-debater"]);
  });

  it("does not send a moderator two messages about the same debate", () => {
    // A moderator who also holds a slot gets the actionable message only.
    const planned = planDebateV15Reminders(
      makeCandidate({
        ...overdue,
        moderatorId: "for-debater",
        acceptedSlots: [
          { userId: "for-debater", stance: "for" },
          { userId: "against-debater", stance: "against" },
        ],
      }),
      NOW
    );

    const forDebaterMessages = planned.filter(
      (item) => item.recipientId === "for-debater"
    );
    expect(forDebaterMessages).toHaveLength(1);
    expect(forDebaterMessages[0].kind).toBe("deadline_missed_moderator");
  });

  it("still nudges the moderator when both sides submitted but the room never moved", () => {
    const planned = planDebateV15Reminders(
      makeCandidate({
        ...overdue,
        submittedAuthorIds: ["for-debater", "against-debater"],
      }),
      NOW
    );

    const toModerator = planned.find(
      (item) => item.kind === "deadline_missed_moderator"
    );
    expect(toModerator).toBeDefined();
    expect(toModerator?.missingSides).toEqual([]);
  });

  it("chases an overdue recruiting stage too, where no one owes a submission", () => {
    const planned = planDebateV15Reminders(
      makeCandidate({ ...overdue, phase: "recruiting" }),
      NOW
    );

    expect(
      planned.some((item) => item.kind === "deadline_missed_moderator")
    ).toBe(true);
  });
});

describe("planDebateV15Reminders — nothing to act on", () => {
  it("ignores a debate with no deadline set for its phase", () => {
    expect(planDebateV15Reminders(makeCandidate({ deadline: null }), NOW)).toEqual(
      []
    );
  });

  it("ignores an unparseable deadline rather than treating it as overdue", () => {
    expect(
      planDebateV15Reminders(makeCandidate({ deadline: "not-a-date" }), NOW)
    ).toEqual([]);
  });
});
