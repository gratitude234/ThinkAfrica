import { describe, expect, it } from "vitest";
import { getActionInboxSummary } from "./actionInbox";

const createdAt = "2026-07-28T12:00:00.000Z";

describe("Debate V1.5 action inbox notifications", () => {
  it.each([
    ["debate_invitation", "Debate invitation", "Review invitation"],
    [
      "debate_invitation_response",
      "Debate invitation update",
      "Open debate",
    ],
    ["debate_phase_advanced", "Debate stage opened", "Open debate"],
    ["debate_cancelled", "Debate cancelled", "View record"],
  ])("maps %s to a clear debate action", (type, label, cta) => {
    const summary = getActionInboxSummary([
      {
        id: type,
        type,
        read: false,
        created_at: createdAt,
        message: "A debate update",
        link: "/debates/debate-id",
      },
    ]);

    expect(summary.primaryAction).toMatchObject({
      type,
      label,
      cta,
      href: "/debates/debate-id",
      description: "A debate update",
    });
  });
});
