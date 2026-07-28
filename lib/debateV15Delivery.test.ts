import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendUserEmail: vi.fn(async () => ({ ok: true, id: "email-1" })),
  sendPushNotification: vi.fn(async () => ({ ok: true, sent: 1 })),
  logEmailResult: vi.fn(),
  logPushResult: vi.fn(),
}));

vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>(
    "@/lib/email"
  );
  return {
    ...actual,
    sendUserEmail: mocks.sendUserEmail,
    logEmailResult: mocks.logEmailResult,
  };
});

vi.mock("@/lib/push", () => ({
  sendPushNotification: mocks.sendPushNotification,
  logPushResult: mocks.logPushResult,
}));

import {
  buildDebateV15DeliveryContent,
  deliverDebateV15Event,
  type DebateV15DeliveryEvent,
} from "@/lib/debateV15Delivery";

const common = {
  recipientId: "user-2",
  debateId: "debate-1",
  debateTitle: "African universities should teach entrepreneurship",
  eventKey: "event-1",
};

const cases: Array<{
  event: DebateV15DeliveryEvent;
  emailText: string;
  pushText: string;
}> = [
  {
    event: { ...common, kind: "invitation", stance: "for" },
    emailText: "Debate invitation",
    pushText: "argue FOR",
  },
  {
    event: {
      ...common,
      kind: "invitation_response",
      participantName: "Amina Okafor",
      response: "accepted",
    },
    emailText: "Invitation accepted",
    pushText: "Amina Okafor accepted",
  },
  {
    event: { ...common, kind: "invitation_withdrawn", stance: "against" },
    emailText: "Debate invitation withdrawn",
    pushText: "AGAINST invitation was withdrawn",
  },
  {
    event: { ...common, kind: "phase_opened", phase: "opening" },
    emailText: "Opening arguments are now active",
    pushText: "opening stage has started",
  },
  {
    event: { ...common, kind: "phase_opened", phase: "rebuttal" },
    emailText: "Rebuttals are now active",
    pushText: "rebuttal stage has started",
  },
  {
    event: { ...common, kind: "phase_opened", phase: "voting" },
    emailText: "Final community voting is open",
    pushText: "Community voting is now open",
  },
  {
    event: {
      ...common,
      kind: "cancelled",
      reason: "A participant became unavailable.",
    },
    emailText: "Debate cancelled",
    pushText: "A participant became unavailable.",
  },
];

describe("Debate V1.5 delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(cases)(
    "builds email and push copy for $event.kind",
    ({ event, emailText, pushText }) => {
      const content = buildDebateV15DeliveryContent(event);
      expect(
        `${content.email.title} ${content.email.intro} ${content.email.bodyHtml}`
      ).toContain(emailText);
      expect(`${content.push.title} ${content.push.body}`).toContain(pushText);
      expect(content.email.bodyTextLines.join(" ")).toContain(
        common.debateTitle
      );
    }
  );

  it("uses debate preferences, a room link, and a stable email idempotency key", async () => {
    await deliverDebateV15Event({
      ...common,
      kind: "invitation",
      stance: "for",
    });

    expect(mocks.sendUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user-2",
        ctaPath: "/debates/debate-1",
        preferenceKey: "email_debate_updates",
        idempotencyKey: "event-1:email",
      })
    );
    expect(mocks.sendPushNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "user-2",
        path: "/debates/debate-1",
        preferenceKey: "push_debate_updates",
      })
    );
  });

  it("escapes untrusted values in email HTML", () => {
    const content = buildDebateV15DeliveryContent({
      ...common,
      debateTitle: "<script>bad()</script>",
      kind: "cancelled",
      reason: "<img src=x onerror=bad()>",
    });

    expect(content.email.bodyHtml).not.toContain("<script>");
    expect(content.email.bodyHtml).not.toContain("<img");
    expect(content.email.bodyHtml).toContain("&lt;script&gt;");
    expect(content.email.bodyHtml).toContain("&lt;img");
  });

  it("isolates unexpected provider failures", async () => {
    mocks.sendUserEmail.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(
      deliverDebateV15Event({
        ...common,
        kind: "invitation",
        stance: "for",
      })
    ).resolves.toBeUndefined();
    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(1);
  });

  it("logs preference-disabled channels as skips without failing", async () => {
    mocks.sendUserEmail.mockResolvedValueOnce({
      skipped: true,
      reason: "recipient_preference_disabled",
    } as never);
    mocks.sendPushNotification.mockResolvedValueOnce({
      skipped: true,
      reason: "recipient_preference_disabled",
    } as never);

    await expect(
      deliverDebateV15Event({
        ...common,
        kind: "invitation",
        stance: "for",
      })
    ).resolves.toBeUndefined();

    expect(mocks.logEmailResult).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ reason: "recipient_preference_disabled" })
    );
    expect(mocks.logPushResult).toHaveBeenCalledWith(
      "event-1",
      expect.objectContaining({ reason: "recipient_preference_disabled" })
    );
  });
});
