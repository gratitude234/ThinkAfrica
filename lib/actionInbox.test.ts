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

describe("publication subscription notifications", () => {
  it("keeps unread publications out of Needs attention", () => {
    const summary = getActionInboxSummary([
      {
        id: "publication-alert",
        type: "author_published",
        read: false,
        created_at: new Date().toISOString(),
        message: "Ama published a new article",
        link: "/r/p/token",
      },
    ]);

    expect(summary.primaryAction).toBeNull();
    expect(summary.unreadActionCount).toBe(0);
    expect(summary.items[0]).toMatchObject({
      category: "subscriptions",
      requiresAction: false,
      href: "/r/p/token",
    });
  });
});
