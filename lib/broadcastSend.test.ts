import { describe, expect, it, vi } from "vitest";
import {
  MAX_SELECTED_RECIPIENTS,
  SEGMENT_STALE_AFTER_HOURS,
  isSegmentStale,
  sendBroadcast,
  type BroadcastSendRow,
  type SendBroadcastDeps,
} from "@/lib/broadcastSend";

/**
 * The send path is where a bug costs the most: an email that goes twice cannot
 * be recalled, and an email that goes to an audience nobody checked is worse.
 * These exercise the four properties the module claims for itself, plus the
 * failure modes the first version of it got wrong.
 */

function row(overrides: Partial<BroadcastSendRow> = {}): BroadcastSendRow {
  return {
    id: "bc-1",
    subject: "Building the next chapter",
    previewText: "What changes this term.",
    bodyHtml: "<p>Something worth reading.</p>",
    senderKey: "platform",
    audienceKey: "all",
    selectedProfileIds: [],
    status: "draft",
    resendBroadcastId: null,
    selectedSegmentId: null,
    dispatchStartedAt: null,
    recipientCount: 0,
    ...overrides,
  };
}

type Harness = {
  deps: SendBroadcastDeps;
  state: { current: BroadcastSendRow };
  calls: {
    createResendBroadcast: ReturnType<typeof vi.fn>;
    sendResendBroadcast: ReturnType<typeof vi.fn>;
    resolveSendSegment: ReturnType<typeof vi.fn>;
    claimForSend: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
    markSending: ReturnType<typeof vi.fn>;
    markDispatchStarted: ReturnType<typeof vi.fn>;
    releaseClaim: ReturnType<typeof vi.fn>;
  };
};

/**
 * A harness that behaves like the real store: the claim is atomic, mutates the
 * shared row, and only succeeds once. Testing the send path against a claim
 * that always succeeds would prove nothing about the race it exists to lose.
 */
function harness(
  initial: BroadcastSendRow,
  overrides: Partial<SendBroadcastDeps> = {}
): Harness {
  const state = { current: initial };

  const claimForSend = vi.fn(async () => {
    const current = state.current;
    if (
      !["draft", "failed"].includes(current.status) ||
      current.dispatchStartedAt
    ) {
      return null;
    }
    state.current = { ...current, status: "queued" };
    return state.current;
  });

  const createResendBroadcast = vi.fn(async () => ({ id: "resend-bc-1" }));
  const sendResendBroadcast = vi.fn(async () => {});
  const resolveSendSegment = vi.fn(async () => ({
    ok: true as const,
    segmentId: "seg-all",
    recipientCount: 1200,
  }));
  const markFailed = vi.fn(async (_id: string, note: string) => {
    state.current = { ...state.current, status: "failed", recipientCount: state.current.recipientCount };
    void note;
  });
  const markSending = vi.fn(async ({ recipientCount }: { recipientCount: number }) => {
    state.current = { ...state.current, status: "sending", recipientCount };
  });
  const markDispatchStarted = vi.fn(
    async ({ recipientCount, at }: { recipientCount: number; at: Date }) => {
      state.current = {
        ...state.current,
        dispatchStartedAt: at.toISOString(),
        recipientCount,
      };
    }
  );
  const releaseClaim = vi.fn(async (_id: string, status: BroadcastSendRow["status"]) => {
    state.current = { ...state.current, status };
  });

  const deps: SendBroadcastDeps = {
    loadBroadcast: async () => state.current,
    checkSendPrecondition: async () => ({ ok: true, recipientCount: 1200 }),
    resolveSendSegment,
    claimForSend,
    attachResendBroadcastId: async (_id, resendBroadcastId) => {
      state.current = { ...state.current, resendBroadcastId };
    },
    markDispatchStarted,
    markSending,
    markFailed,
    releaseClaim,
    buildEmail: () => ({
      name: "Building the next chapter",
      from: "Indegenius <indegenius@indegenius.africa>",
      subject: "Building the next chapter",
      previewText: "What changes this term.",
      html: "<p>Something worth reading.</p>",
      text: "Something worth reading.",
    }),
    createResendBroadcast,
    sendResendBroadcast,
    now: () => new Date("2026-09-02T12:00:00Z"),
    ...overrides,
  };

  return {
    deps,
    state,
    calls: {
      createResendBroadcast,
      sendResendBroadcast,
      resolveSendSegment,
      claimForSend,
      markFailed,
      markSending,
      markDispatchStarted,
      releaseClaim,
    },
  };
}

describe("segment staleness", () => {
  const now = new Date("2026-09-02T12:00:00Z");

  it("trusts a segment synced within the window", () => {
    expect(isSegmentStale("2026-09-02T06:00:00Z", now)).toBe(false);
  });

  it("refuses a segment synced longer ago than the window", () => {
    const old = new Date(
      now.getTime() - (SEGMENT_STALE_AFTER_HOURS + 1) * 60 * 60 * 1000
    ).toISOString();
    expect(isSegmentStale(old, now)).toBe(true);
  });

  it("treats a segment that has never synced as stale", () => {
    expect(isSegmentStale(null, now)).toBe(true);
  });

  it("treats an unparseable timestamp as stale rather than fresh", () => {
    expect(isSegmentStale("not a date", now)).toBe(true);
  });
});

describe("sending a broadcast", () => {
  it("creates the Resend draft, records its id, then dispatches", async () => {
    const test = harness(row());

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: true, outcome: "dispatched" });
    expect(test.calls.createResendBroadcast).toHaveBeenCalledTimes(1);
    expect(test.calls.sendResendBroadcast).toHaveBeenCalledWith("resend-bc-1");
    expect(test.state.current.status).toBe("sending");
    expect(test.state.current.recipientCount).toBe(1200);
  });

  it("stamps the dispatch before calling Resend, not after", async () => {
    const order: string[] = [];
    const test = harness(row(), {
      markDispatchStarted: async () => {
        order.push("stamp");
      },
      sendResendBroadcast: async () => {
        order.push("send");
      },
    });

    await sendBroadcast("bc-1", "admin-1", test.deps);

    // A crash between the two must leave the row un-retryable, which only
    // works if the stamp lands first.
    expect(order).toEqual(["stamp", "send"]);
  });
});

describe("double send prevention", () => {
  it("does nothing the second time when the first is still sending", async () => {
    const test = harness(row({ status: "sending", resendBroadcastId: "resend-bc-1" }));

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: true, outcome: "already_in_progress" });
    expect(test.calls.claimForSend).not.toHaveBeenCalled();
    expect(test.calls.sendResendBroadcast).not.toHaveBeenCalled();
  });

  it("dispatches exactly once when two clicks race", async () => {
    const test = harness(row());

    const [first, second] = await Promise.all([
      sendBroadcast("bc-1", "admin-1", test.deps),
      sendBroadcast("bc-1", "admin-1", test.deps),
    ]);

    expect(test.calls.sendResendBroadcast).toHaveBeenCalledTimes(1);
    expect(test.calls.createResendBroadcast).toHaveBeenCalledTimes(1);
    const outcomes = [first, second].map((r) => (r.ok ? r.outcome : r.reason));
    expect(outcomes).toContain("dispatched");
    expect(outcomes).toContain("already_in_progress");
  });

  it("spends no Resend call at all on the losing click", async () => {
    // The first version resolved the segment before claiming, which for a
    // hand-picked audience created a whole segment per click.
    const test = harness(row({ audienceKey: "selected", selectedProfileIds: ["p1"] }));

    await Promise.all([
      sendBroadcast("bc-1", "admin-1", test.deps),
      sendBroadcast("bc-1", "admin-1", test.deps),
    ]);

    expect(test.calls.resolveSendSegment).toHaveBeenCalledTimes(1);
  });

  it("refuses a row that has ever been dispatched, however it ended up", async () => {
    const test = harness(
      row({
        status: "failed",
        dispatchStartedAt: "2026-09-02T11:00:00Z",
        resendBroadcastId: "resend-bc-1",
      })
    );

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "already_dispatched" });
    expect(test.calls.sendResendBroadcast).not.toHaveBeenCalled();
  });

  it("re-sends the same Resend draft rather than making a second", async () => {
    // A create that succeeded but whose response was lost leaves the id on the
    // row. The retry must dispatch that draft, not build another.
    const test = harness(row({ status: "failed", resendBroadcastId: "resend-bc-1" }));

    await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(test.calls.createResendBroadcast).not.toHaveBeenCalled();
    expect(test.calls.sendResendBroadcast).toHaveBeenCalledWith("resend-bc-1");
  });
});

describe("refusing an untrustworthy audience", () => {
  it("blocks a send against a stale segment and leaves the draft editable", async () => {
    const test = harness(row(), {
      checkSendPrecondition: async () => ({
        ok: false,
        reason: "segment_stale",
        message: "Recipient sync has not run recently enough.",
      }),
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "segment_stale" });
    expect(test.calls.claimForSend).not.toHaveBeenCalled();
    expect(test.state.current.status).toBe("draft");
  });

  it("blocks a send when the audience has no Resend segment yet", async () => {
    const test = harness(row(), {
      checkSendPrecondition: async () => ({
        ok: false,
        reason: "segment_missing",
        message: "No segment yet.",
      }),
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "segment_missing" });
    expect(test.calls.sendResendBroadcast).not.toHaveBeenCalled();
  });

  it("blocks a send to an empty audience", async () => {
    const test = harness(row(), {
      checkSendPrecondition: async () => ({ ok: true, recipientCount: 0 }),
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "no_recipients" });
    expect(test.calls.claimForSend).not.toHaveBeenCalled();
  });

  it("caps a hand-picked list before it can time out the request", async () => {
    const test = harness(
      row({
        audienceKey: "selected",
        selectedProfileIds: Array.from(
          { length: MAX_SELECTED_RECIPIENTS + 1 },
          (_, index) => `p${index}`
        ),
      })
    );

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "too_many_recipients" });
  });

  it("releases the claim when the segment turns out unusable after claiming", async () => {
    const test = harness(row(), {
      resolveSendSegment: async () => ({
        ok: false,
        reason: "no_recipients",
        message: "Nobody eligible.",
      }),
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "no_recipients" });
    // Back to a draft the admin can fix, not a failure they have to explain.
    expect(test.calls.releaseClaim).toHaveBeenCalledWith("bc-1", "draft");
    expect(test.state.current.status).toBe("draft");
  });

  it("refuses an empty subject or body without touching Resend", async () => {
    const noSubject = harness(row({ subject: "   " }));
    expect(await sendBroadcast("bc-1", "a", noSubject.deps)).toMatchObject({
      ok: false,
      reason: "empty_subject",
    });

    const noBody = harness(row({ bodyHtml: "<p></p>" }));
    expect(await sendBroadcast("bc-1", "a", noBody.deps)).toMatchObject({
      ok: false,
      reason: "empty_body",
    });

    expect(noSubject.calls.claimForSend).not.toHaveBeenCalled();
    expect(noBody.calls.claimForSend).not.toHaveBeenCalled();
  });
});

describe("Resend failures", () => {
  it("marks the broadcast failed when the draft cannot be created", async () => {
    const test = harness(row(), {
      createResendBroadcast: async () => {
        throw new Error("Resend broadcasts.create failed: invalid_from_address");
      },
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "resend_failed" });
    expect(test.calls.markFailed).toHaveBeenCalled();
    expect(test.calls.sendResendBroadcast).not.toHaveBeenCalled();
  });

  it("marks a create failure retryable, because nothing was dispatched", async () => {
    const test = harness(row(), {
      createResendBroadcast: async () => {
        throw new Error("network reset");
      },
    });

    await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(test.state.current.dispatchStartedAt).toBeNull();
    expect(test.state.current.status).toBe("failed");
  });

  it("does not offer a retry when the send call itself failed", async () => {
    // Resend may have accepted the request anyway. Retrying is the one thing
    // that could double-send, so this is reconciled rather than retried.
    const test = harness(row(), {
      sendResendBroadcast: async () => {
        throw new Error("gateway timeout");
      },
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "needs_reconciliation" });
    expect(test.state.current.dispatchStartedAt).not.toBeNull();

    // And a second attempt is refused rather than sending again.
    const retry = await sendBroadcast("bc-1", "admin-1", test.deps);
    expect(retry).toMatchObject({ ok: false, reason: "already_dispatched" });
  });

  it("still reports success when only our own status write fails", async () => {
    // Resend has the broadcast. Saying "failed" here would be a lie to the
    // admin about mail that is on its way out.
    const test = harness(row(), {
      markSending: async () => {
        throw new Error("supabase unavailable");
      },
    });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: true, outcome: "dispatched" });
    expect(test.calls.markFailed).not.toHaveBeenCalled();
  });
});
