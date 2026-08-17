import { describe, expect, it, vi } from "vitest";
import { getActionInboxSummary, isActionableType } from "./actionInbox";

const createdAt = "2026-07-28T12:00:00.000Z";

function notification(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: type,
    type,
    read: false,
    created_at: createdAt,
    message: `A ${type} update`,
    ...overrides,
  };
}

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

describe("actionability", () => {
  it.each([
    "revision_requested",
    "review_assigned",
    "response_post",
    "opportunity_inquiry",
    "co_author_invite",
    "research_collaboration_request",
    "debate_invitation",
  ])("treats %s as something the reader must act on", (type) => {
    expect(isActionableType(type)).toBe(true);
    expect(getActionInboxSummary([notification(type)]).items[0].actionable).toBe(
      true
    );
  });

  it.each([
    "follow",
    "like",
    "comment",
    "author_subscribed",
    "author_published",
    "topic_published",
  ])(
    "treats %s as activity rather than an action",
    (type) => {
      expect(isActionableType(type)).toBe(false);
      expect(getActionInboxSummary([notification(type)]).items[0].actionable).toBe(
        false
      );
      expect(
        getActionInboxSummary([notification(type)]).items[0].requiresAction
      ).toBe(false);
    }
  );
});

describe("primaryActionable", () => {
  it("is null when the only unread items are passive activity", () => {
    // Regression: a lone new follower used to be promoted into a full-width
    // "Needs attention" hero purely for being the newest unread row.
    const summary = getActionInboxSummary([
      notification("follow"),
      notification("like"),
    ]);

    expect(summary.primaryAction?.type).toBe("follow");
    expect(summary.primaryActionable).toBeNull();
  });

  it("picks the highest-priority unread item that needs a response", () => {
    const summary = getActionInboxSummary([
      notification("like"),
      notification("follow"),
      notification("review_assigned"),
      notification("revision_requested"),
    ]);

    expect(summary.primaryActionable?.type).toBe("revision_requested");
  });

  it("ignores actionable items that have already been read", () => {
    const summary = getActionInboxSummary([
      notification("revision_requested", { read: true }),
      notification("follow"),
    ]);

    expect(summary.primaryActionable).toBeNull();
  });
});

describe("type coverage regressions", () => {
  it("labels a publication delivery instead of calling it 'New notification'", () => {
    // The reported bug: this rendered as "NEW NOTIFICATION — Yusuph Sebasi
    // published a new Article: ..." because actionInbox had no author_published case.
    const summary = getActionInboxSummary([
      notification("author_published", {
        message: "Yusuph Sebasi published a new Article: The Burden Of Sickle Cell Disease",
      }),
    ]);

    expect(summary.items[0]).toMatchObject({
      label: "New from an author you follow",
      cta: "Read now",
      category: "activity",
    });
  });

  it("keeps publication alerts out of Needs attention", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");
    const summary = getActionInboxSummary([
      notification("author_published"),
      notification("topic_published"),
    ]);

    expect(summary.items.every((item) => item.category === "subscriptions")).toBe(
      true
    );
    expect(summary.unreadActionCount).toBe(0);
    expect(summary.primaryActionable).toBeNull();
    vi.unstubAllEnvs();
  });

  it("promotes a suspension over every other unread item", () => {
    const summary = getActionInboxSummary([
      notification("like"),
      notification("revision_requested"),
      notification("account_suspended"),
      notification("follow"),
    ]);

    expect(summary.primaryAction?.type).toBe("account_suspended");
    expect(summary.primaryActionable?.type).toBe("account_suspended");
    expect(summary.primaryActionable?.label).toBe("Account suspended");
  });

  it.each([
    ["moderation_post_removed", "Post removed"],
    ["moderation_comment_hidden", "Comment hidden"],
    ["review_started", "Submission under review"],
    ["review_reminder", "Review overdue"],
    ["co_author_accepted", "Co-author invite accepted"],
    ["topic_published", "New in a topic you follow"],
    ["debate_v2_round_change", "New debate round"],
    ["debate_v2_final_vote", "Final vote open"],
    ["debate_v2_direct_response", "Direct response"],
    ["debate_v2_evidence_requested", "Evidence requested"],
  ])("gives %s its own label", (type, label) => {
    expect(getActionInboxSummary([notification(type)]).items[0].label).toBe(label);
  });

  it("splits the editorial status types that used to share one label", () => {
    const summary = getActionInboxSummary([
      notification("post_published"),
      notification("post_rejected"),
    ]);
    const labels = summary.items.map((item) => item.label);

    expect(labels).toContain("Published");
    expect(labels).toContain("Not accepted");
    expect(labels).not.toContain("Application or review update");
    // The shared analytics key is deliberately preserved across the split.
    expect(summary.items.every((item) => item.actionKey === "status_update")).toBe(true);
  });
});
