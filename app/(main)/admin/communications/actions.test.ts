import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-side sender enforcement.
 *
 * The composer greys out identities an admin may not use, but that is a
 * courtesy. These check the part that actually matters: every action
 * re-derives capabilities from the session and re-checks the identity, so a
 * crafted request cannot write to the community as the founder.
 */

const {
  capabilities,
  sendDirectEmailMock,
  sendBroadcastMock,
  loadSendRowMock,
  createDraftMock,
  saveDraftMock,
  countAudienceMock,
  auditMock,
} = vi.hoisted(() => ({
  capabilities: { current: ["communications.manage"] as string[] },
  sendDirectEmailMock: vi.fn(),
  sendBroadcastMock: vi.fn(),
  loadSendRowMock: vi.fn(),
  createDraftMock: vi.fn(),
  saveDraftMock: vi.fn(),
  countAudienceMock: vi.fn(),
  auditMock: vi.fn(),
}));

class AdminAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ AdminAccessError }));

vi.mock("@/lib/adminAccess", () => ({
  requireCapability: async (capability: string) => {
    if (!capabilities.current.includes(capability)) {
      throw new AdminAccessError("You do not have permission.", 403);
    }
    return {
      userId: "admin-1",
      email: "admin@indegenius.africa",
      role: "admin",
      fullName: "Admin",
      username: "admin",
      isBootstrapAdmin: false,
      capabilities: capabilities.current,
    };
  },
  recordAdminAuditEvent: auditMock,
}));

vi.mock("@/lib/email", () => ({
  sendDirectEmail: sendDirectEmailMock,
  logEmailResult: vi.fn(),
}));

vi.mock("@/lib/broadcastSend", async () => {
  const actual = await vi.importActual<typeof import("@/lib/broadcastSend")>(
    "@/lib/broadcastSend"
  );
  return { ...actual, sendBroadcast: sendBroadcastMock };
});

vi.mock("@/lib/broadcastStore", () => ({
  loadSendRow: loadSendRowMock,
  createDraft: createDraftMock,
  saveDraft: saveDraftMock,
  countAudience: countAudienceMock,
  createSendDeps: () => ({}),
}));

const actions = await import("./actions");

const composerInput = {
  broadcastId: null,
  subject: "Building the next chapter",
  previewText: "",
  bodyHtml: "<p>Something worth reading.</p>",
  senderKey: "platform",
  audienceKey: "all",
  selectedProfileIds: [],
};

beforeEach(() => {
  capabilities.current = ["communications.manage"];
  sendDirectEmailMock.mockResolvedValue({ ok: true, id: "email-1" });
  createDraftMock.mockResolvedValue("bc-1");
  saveDraftMock.mockResolvedValue("saved");
  countAudienceMock.mockResolvedValue(42);
  sendBroadcastMock.mockResolvedValue({
    ok: true,
    outcome: "dispatched",
    status: "sending",
    recipientCount: 42,
    resendBroadcastId: "resend-bc-1",
  });
  loadSendRowMock.mockResolvedValue({
    id: "bc-1",
    senderKey: "platform",
    audienceKey: "all",
    selectedProfileIds: [],
    status: "draft",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("saving a draft", () => {
  it("saves under an identity this admin may use", async () => {
    const result = await actions.saveBroadcastDraft(composerInput);

    expect(result).toMatchObject({ ok: true, broadcastId: "bc-1" });
  });

  it("refuses to save a draft written as the founder without that capability", async () => {
    const result = await actions.saveBroadcastDraft({
      ...composerInput,
      senderKey: "ceo",
    });

    expect(result).toMatchObject({ ok: false });
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("allows the founder identity once the capability is granted", async () => {
    capabilities.current = [
      "communications.manage",
      "communications.send_as_executive",
    ];

    const result = await actions.saveBroadcastDraft({
      ...composerInput,
      senderKey: "ceo",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("refuses an identity that does not exist", async () => {
    const result = await actions.saveBroadcastDraft({
      ...composerInput,
      senderKey: "board_chair",
    });

    expect(result).toMatchObject({ ok: false, error: "Unknown sending identity." });
  });

  it("refuses an audience that does not exist", async () => {
    const result = await actions.saveBroadcastDraft({
      ...composerInput,
      audienceKey: "everyone",
    });

    expect(result).toMatchObject({ ok: false, error: "Unknown audience." });
  });

  it("refuses an admin without the communications capability entirely", async () => {
    capabilities.current = ["moderation.manage"];

    const result = await actions.saveBroadcastDraft(composerInput);

    expect(result).toMatchObject({ ok: false });
    expect(createDraftMock).not.toHaveBeenCalled();
  });

  it("reports a draft that could not be saved because a send claimed it", async () => {
    saveDraftMock.mockResolvedValue("locked");

    const result = await actions.saveBroadcastDraft({
      ...composerInput,
      broadcastId: "bc-1",
    });

    expect(result).toMatchObject({ ok: true, locked: true });
  });

  it("caps a hand-picked list at what the send path will accept", async () => {
    await actions.saveBroadcastDraft({
      ...composerInput,
      audienceKey: "selected",
      selectedProfileIds: Array.from({ length: 900 }, (_, i) => `p${i}`),
    });

    const saved = createDraftMock.mock.calls[0][0];
    expect(saved.selectedProfileIds.length).toBe(200);
  });
});

describe("sending a test", () => {
  it("goes through the transactional API, never a segment", async () => {
    const result = await actions.sendBroadcastTest({
      broadcastId: "bc-1",
      recipient: "me@example.com",
      subject: "Subject",
      previewText: "",
      bodyHtml: "<p>Body</p>",
      senderKey: "platform",
    });

    expect(result).toMatchObject({ ok: true, recipient: "me@example.com" });
    expect(sendDirectEmailMock).toHaveBeenCalledTimes(1);
    expect(sendDirectEmailMock.mock.calls[0][0].to).toBe("me@example.com");
  });

  it("writes the unsubscribe line inert, because a test resolves no merge tag", async () => {
    // Resend only substitutes RESEND_UNSUBSCRIBE_URL in a broadcast. Sending
    // the raw merge tag to an admin's inbox would look broken and teach
    // nothing about the real footer.
    await actions.sendBroadcastTest({
      broadcastId: "bc-1",
      recipient: "me@example.com",
      subject: "Subject",
      previewText: "",
      bodyHtml: "<p>Body</p>",
      senderKey: "platform",
    });

    const footer = sendDirectEmailMock.mock.calls[0][0].footerNote as string;
    expect(footer).not.toContain("RESEND_UNSUBSCRIBE_URL");
    expect(footer).toContain("Unsubscribe from Indegenius announcements");
  });

  it("refuses a test from an identity this admin may not use", async () => {
    const result = await actions.sendBroadcastTest({
      broadcastId: "bc-1",
      recipient: "me@example.com",
      subject: "Subject",
      previewText: "",
      bodyHtml: "<p>Body</p>",
      senderKey: "cto",
    });

    expect(result).toMatchObject({ ok: false });
    expect(sendDirectEmailMock).not.toHaveBeenCalled();
  });

  it("refuses an address that is not one", async () => {
    const result = await actions.sendBroadcastTest({
      broadcastId: "bc-1",
      recipient: "not-an-address",
      subject: "Subject",
      previewText: "",
      bodyHtml: "<p>Body</p>",
      senderKey: "platform",
    });

    expect(result).toMatchObject({ ok: false, error: "Add a valid email address." });
  });

  it("says so plainly when email is not configured here", async () => {
    sendDirectEmailMock.mockResolvedValue({
      skipped: true,
      reason: "missing_email_configuration",
    });

    const result = await actions.sendBroadcastTest({
      broadcastId: "bc-1",
      recipient: "me@example.com",
      subject: "Subject",
      previewText: "",
      bodyHtml: "<p>Body</p>",
      senderKey: "platform",
    });

    expect(result).toMatchObject({ ok: false });
  });
});

describe("dispatching", () => {
  it("authorizes against the identity stored on the row, not one supplied", async () => {
    // Otherwise whoever presses send could re-point a draft at an identity
    // they are not entitled to by editing the request.
    loadSendRowMock.mockResolvedValue({
      id: "bc-1",
      senderKey: "ceo",
      audienceKey: "all",
      selectedProfileIds: [],
      status: "draft",
    });

    const result = await actions.dispatchBroadcast("bc-1");

    expect(result).toMatchObject({ ok: false });
    expect(sendBroadcastMock).not.toHaveBeenCalled();
  });

  it("records an audit event for a broadcast that actually went out", async () => {
    await actions.dispatchBroadcast("bc-1");

    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "broadcast_sent",
        targetId: "bc-1",
        metadata: expect.objectContaining({ recipient_count: 42 }),
      })
    );
  });

  it("does not record a second audit event for a repeated click", async () => {
    sendBroadcastMock.mockResolvedValue({
      ok: true,
      outcome: "already_in_progress",
      status: "sending",
      recipientCount: 42,
      resendBroadcastId: "resend-bc-1",
    });

    const result = await actions.dispatchBroadcast("bc-1");

    expect(result).toMatchObject({ ok: true, outcome: "already_in_progress" });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("surfaces a refusal from the send path rather than swallowing it", async () => {
    sendBroadcastMock.mockResolvedValue({
      ok: false,
      reason: "segment_stale",
      message: "Recipient sync has not run recently enough to trust this audience.",
    });

    const result = await actions.dispatchBroadcast("bc-1");

    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/Recipient sync/);
  });

  it("reports a broadcast that is not there", async () => {
    loadSendRowMock.mockResolvedValue(null);

    expect(await actions.dispatchBroadcast("missing")).toMatchObject({
      ok: false,
      error: "Broadcast not found.",
    });
  });
});

describe("audience counts", () => {
  it("counts for an admin with the capability", async () => {
    expect(await actions.refreshAudienceCount("all")).toMatchObject({
      ok: true,
      count: 42,
    });
  });

  it("refuses an admin without it", async () => {
    capabilities.current = [];

    expect(await actions.refreshAudienceCount("all")).toMatchObject({ ok: false });
    expect(countAudienceMock).not.toHaveBeenCalled();
  });
});
