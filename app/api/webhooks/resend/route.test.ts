import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The webhook is the only source of delivery numbers and the fastest source of
 * unsubscribes, and Resend retries it until it gets a 2xx. That makes replay
 * the normal case rather than the edge case, so most of what is worth testing
 * here is what happens the second time the same event arrives.
 */

const { verifyMock, rpcMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/resendClient", () => ({
  getResendClient: () => ({ webhooks: { verify: verifyMock } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

const { POST } = await import("./route");

const SIGNED_HEADERS = {
  "svix-id": "msg_1",
  "svix-timestamp": "1756814400",
  "svix-signature": "v1,signature",
};

function request(
  body: unknown,
  headers: Record<string, string> = SIGNED_HEADERS
) {
  return new Request("https://indegenius.africa/api/webhooks/resend", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    // The route only reads headers and the body text, so a plain Request is a
    // faithful stand-in for the NextRequest it is typed against.
  }) as unknown as Parameters<typeof POST>[0];
}

function deliveredEvent(emailId = "email_1") {
  return {
    type: "email.delivered",
    created_at: "2026-09-02T12:00:00Z",
    data: {
      broadcast_id: "resend-bc-1",
      email_id: emailId,
      created_at: "2026-09-02T12:00:00Z",
      from: "Indegenius <indegenius@indegenius.africa>",
      to: ["member@example.com"],
      subject: "Building the next chapter",
    },
  };
}

const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
const originalApiKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
  process.env.RESEND_API_KEY = "re_test";
  verifyMock.mockReset();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: true, error: null });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalApiKey;
});

describe("signature handling", () => {
  it("passes the three Svix headers by name", async () => {
    // Handing the SDK the Headers object itself yields three undefined values
    // and fails every signature, which is how the first version rejected 100%
    // of real events.
    verifyMock.mockReturnValue(deliveredEvent());

    await POST(request(deliveredEvent()));

    expect(verifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          id: "msg_1",
          timestamp: "1756814400",
          signature: "v1,signature",
        },
        webhookSecret: "whsec_test",
      })
    );
  });

  it("rejects a payload with no signature headers", async () => {
    const response = await POST(request(deliveredEvent(), {}));

    expect(response.status).toBe(401);
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it("rejects a payload whose signature does not verify", async () => {
    verifyMock.mockImplementation(() => {
      throw new Error("No matching signature found");
    });

    const response = await POST(request(deliveredEvent()));

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("refuses to run at all without a configured secret", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const response = await POST(request(deliveredEvent()));

    expect(response.status).toBe(503);
    expect(verifyMock).not.toHaveBeenCalled();
  });
});

describe("delivery counting", () => {
  it("records a delivery against the broadcast that produced it", async () => {
    verifyMock.mockReturnValue(deliveredEvent());

    const response = await POST(request(deliveredEvent()));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("record_broadcast_delivery_event", {
      p_resend_broadcast_id: "resend-bc-1",
      p_email_id: "email_1",
      p_event_type: "email.delivered",
      p_delivered: 1,
      p_failed: 0,
    });
  });

  it("hands every event the identity that makes it deduplicable", async () => {
    // The counters cannot be idempotent unless the RPC is told which message
    // this is. The first version sent only a delta, so a retry added one more.
    verifyMock.mockReturnValue(deliveredEvent("email_42"));

    await POST(request(deliveredEvent("email_42")));

    const payload = rpcMock.mock.calls[0][1];
    expect(payload.p_email_id).toBe("email_42");
    expect(payload.p_event_type).toBe("email.delivered");
  });

  it("answers 200 to a replay so Resend stops retrying it", async () => {
    // The RPC answers false when the event was already recorded. That is a
    // successful no-op, not a failure: a non-2xx would ask for another retry.
    verifyMock.mockReturnValue(deliveredEvent());
    rpcMock.mockResolvedValue({ data: false, error: null });

    const response = await POST(request(deliveredEvent()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ counted: false });
  });

  it("counts a bounce as a failure", async () => {
    const bounced = {
      ...deliveredEvent(),
      type: "email.bounced",
      data: { ...deliveredEvent().data, bounce: { message: "", subType: "", type: "" } },
    };
    verifyMock.mockReturnValue(bounced);

    await POST(request(bounced));

    expect(rpcMock.mock.calls[0][1]).toMatchObject({
      p_delivered: 0,
      p_failed: 1,
    });
  });

  it("ignores transactional email, which carries no broadcast id", async () => {
    const transactional = {
      type: "email.delivered",
      created_at: "2026-09-02T12:00:00Z",
      data: {
        email_id: "email_9",
        created_at: "2026-09-02T12:00:00Z",
        from: "Indegenius <indegenius@indegenius.africa>",
        to: ["member@example.com"],
        subject: "Someone replied to your post",
      },
    };
    verifyMock.mockReturnValue(transactional);

    const response = await POST(request(transactional));

    expect(response.status).toBe(200);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("ignores an event that says nothing about delivery", async () => {
    const opened = { ...deliveredEvent(), type: "email.opened" };
    verifyMock.mockReturnValue(opened);

    await POST(request(opened));

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports a database failure so Resend retries", async () => {
    verifyMock.mockReturnValue(deliveredEvent());
    rpcMock.mockResolvedValue({ data: null, error: { message: "deadlock" } });

    const response = await POST(request(deliveredEvent()));

    expect(response.status).toBe(500);
  });
});

describe("mirroring an unsubscribe", () => {
  function contactEvent(unsubscribed: boolean) {
    return {
      type: "contact.updated",
      created_at: "2026-09-02T12:00:00Z",
      data: {
        id: "contact_1",
        audience_id: "aud_1",
        segment_ids: ["seg_all"],
        created_at: "2026-09-02T11:00:00Z",
        updated_at: "2026-09-02T12:00:00Z",
        email: "Member@Example.com",
        unsubscribed,
      },
    };
  }

  it("mirrors an opt-out the moment Resend reports it", async () => {
    // Waiting for the nightly pass leaves a window in which a sync could put
    // somebody back into the segment they just left.
    verifyMock.mockReturnValue(contactEvent(true));

    const response = await POST(request(contactEvent(true)));

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("mirror_broadcast_unsubscribe", {
      p_email: "member@example.com",
      p_resend_contact_id: "contact_1",
    });
  });

  it("ignores a contact update that is not an opt-out", async () => {
    verifyMock.mockReturnValue(contactEvent(false));

    const response = await POST(request(contactEvent(false)));

    expect(response.status).toBe(200);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("never re-subscribes anybody from a webhook", async () => {
    // Undoing an opt-out is a decision the member makes inside Indegenius.
    // Nothing arriving over this endpoint may do it on their behalf.
    verifyMock.mockReturnValue(contactEvent(false));

    await POST(request(contactEvent(false)));

    const calledRpcs = rpcMock.mock.calls.map((call) => call[0]);
    expect(calledRpcs).not.toContain("mirror_broadcast_resubscribe");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
