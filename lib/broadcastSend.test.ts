import { describe, expect, it, vi } from "vitest";
import {
  MAX_SELECTED_RECIPIENTS,
  SEGMENT_STALE_AFTER_HOURS,
  isSegmentStale,
  sendBroadcast,
  type BroadcastSendRow,
  type SendBroadcastDeps,
} from "@/lib/broadcastSend";
import {
  DUPLICATE_CAMPAIGN_WINDOW_HOURS,
  campaignFingerprint,
} from "@/lib/broadcastFingerprint";

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
    claimForCampaign: ReturnType<typeof vi.fn>;
    supersedeEquivalentDrafts: ReturnType<typeof vi.fn>;
    createResendBroadcast: ReturnType<typeof vi.fn>;
    sendResendBroadcast: ReturnType<typeof vi.fn>;
    resolveSendSegment: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
    markSending: ReturnType<typeof vi.fn>;
    markDispatchStarted: ReturnType<typeof vi.fn>;
    releaseClaim: ReturnType<typeof vi.fn>;
    readProviderBroadcastStatus: ReturnType<typeof vi.fn>;
    releaseAfterRejection: ReturnType<typeof vi.fn>;
  };
};

/**
 * Resend's own error shape, near enough for the classifier: a validation
 * rejection carries a 4xx, a transport failure carries nothing at all.
 */
class FakeResendError extends Error {
  readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null) {
    super(message);
    this.name = "ResendApiError";
    this.statusCode = statusCode;
  }
}

function isFakeDefinitiveRejection(error: unknown) {
  if (!(error instanceof FakeResendError)) return false;
  if (error.statusCode === null) return false;
  if ([408, 409, 425, 429].includes(error.statusCode)) return false;
  return error.statusCode >= 400 && error.statusCode < 500;
}

/**
 * A harness that behaves like the real store: the claim is atomic, mutates the
 * shared row, and only succeeds once. Testing the send path against a claim
 * that always succeeds would prove nothing about the race it exists to lose.
 */
type CampaignRecord = {
  id: string;
  subject: string;
  fingerprint: string;
  irreversible: boolean;
};

function harness(
  initial: BroadcastSendRow,
  overrides: Partial<SendBroadcastDeps> = {},
  seed: { campaigns?: CampaignRecord[]; supersedable?: string[] } = {}
): Harness {
  const state = { current: initial };
  // Used by reference, not copied, so two harnesses can be given the same
  // store and race each other the way two tabs race one campaign.
  const campaigns: CampaignRecord[] = seed.campaigns ?? [];
  const supersedable: string[] = [...(seed.supersedable ?? [])];

  /**
   * Behaves like claim_broadcast_for_campaign: the duplicate check and the
   * claim happen together, against a shared store, so a test that races two
   * sends is racing the thing the real system races.
   */
  const claimForCampaign = vi.fn(
    async (input: {
      id: string;
      fingerprint: string;
      windowHours: number;
      override: boolean;
    }) => {
      if (!input.override) {
        const duplicate = campaigns.find(
          (entry) =>
            entry.id !== input.id &&
            entry.fingerprint === input.fingerprint &&
            entry.irreversible
        );
        if (duplicate) {
          return {
            outcome: "duplicate" as const,
            duplicate: {
              broadcastId: duplicate.id,
              subject: duplicate.subject,
              status: "sent" as const,
              sentAt: "2026-09-04T23:09:00Z",
            },
          };
        }
      }

      const current = state.current;
      if (
        !["draft", "failed"].includes(current.status) ||
        current.dispatchStartedAt
      ) {
        return { outcome: "unclaimable" as const };
      }

      state.current = { ...current, status: "queued" };
      // The claim itself is what makes this campaign irreversible to any other
      // caller, which is the property the advisory lock exists to guarantee.
      campaigns.push({
        id: current.id,
        subject: current.subject,
        fingerprint: input.fingerprint,
        irreversible: true,
      });
      return { outcome: "claimed" as const, row: state.current };
    }
  );

  const supersedeEquivalentDrafts = vi.fn(async () => supersedable.splice(0));

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

  // Defaults to the safe answer. A test that wants an unlock has to say so.
  const readProviderBroadcastStatus = vi.fn(async () => "unknown" as const);

  /**
   * Mirrors the store's conditional update: it only matches while the row is
   * still the queued, dispatch-stamped row this caller claimed.
   */
  const releaseAfterRejection = vi.fn(
    async (input: { id: string; resendBroadcastId: string; note: string }) => {
      const current = state.current;
      if (current.status !== "queued" || !current.dispatchStartedAt) return false;
      // The statement matches on the Resend id whose status was read, so a row
      // re-pointed at a different broadcast is not this caller's to release.
      if (current.resendBroadcastId !== input.resendBroadcastId) return false;
      state.current = {
        ...current,
        status: "draft",
        dispatchStartedAt: null,
      };
      return true;
    }
  );

  const deps: SendBroadcastDeps = {
    loadBroadcast: async () => state.current,
    checkSendPrecondition: async () => ({ ok: true, recipientCount: 1200 }),
    resolveSendSegment,
    claimForCampaign,
    // The real fingerprint, so the tests exercise the actual normalisation
    // rather than a stand-in that could agree where the real one disagrees.
    fingerprint: campaignFingerprint,
    duplicateWindowHours: DUPLICATE_CAMPAIGN_WINDOW_HOURS,
    supersedeEquivalentDrafts,
    attachResendBroadcastId: async (_id, resendBroadcastId) => {
      state.current = { ...state.current, resendBroadcastId };
    },
    markDispatchStarted,
    markSending,
    markFailed,
    releaseClaim,
    isDefinitiveRejection: isFakeDefinitiveRejection,
    readProviderBroadcastStatus,
    releaseAfterRejection,
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
      claimForCampaign,
      supersedeEquivalentDrafts,
      markFailed,
      markSending,
      markDispatchStarted,
      releaseClaim,
      readProviderBroadcastStatus,
      releaseAfterRejection,
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
    expect(test.calls.claimForCampaign).not.toHaveBeenCalled();
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

describe("cross-broadcast duplicate protection", () => {
  const WELCOME = {
    subject: "Welcome to Indegenius",
    bodyHtml: "<p>We are glad you are here.</p>",
    audienceKey: "all" as const,
  };

  /** The campaign that already went out, as the production one did. */
  function alreadySent(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
    return {
      id: "c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4",
      subject: "Welcome to Indegenius",
      fingerprint: campaignFingerprint(WELCOME),
      irreversible: true,
      ...overrides,
    };
  }

  it("blocks a second row carrying the same campaign", async () => {
    // The production sequence: two different local rows, identical subject,
    // body and audience, two minutes apart. Per-row idempotency was never
    // going to see it, because each row was sent exactly once.
    const test = harness(
      row({ id: "24b75e7d-b9c4-4fbb-887b-c8f4c903b138", ...WELCOME }),
      {},
      { campaigns: [alreadySent()] }
    );

    const result = await sendBroadcast("24b75e7d", "admin-1", test.deps);

    expect(result).toMatchObject({
      ok: false,
      reason: "duplicate_campaign",
      duplicate: { broadcastId: "c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4" },
    });
    expect(test.calls.sendResendBroadcast).not.toHaveBeenCalled();
    // Refused before anything was spent at Resend, and the row is untouched.
    expect(test.calls.createResendBroadcast).not.toHaveBeenCalled();
    expect(test.state.current.status).toBe("draft");
  });

  it("blocks it even though the sender identity differs", async () => {
    // One went as platform and one as ceo. Who signs a campaign is
    // presentation; the campaign is the message and the people who get it.
    const test = harness(
      row({ id: "24b75e7d", senderKey: "ceo", ...WELCOME }),
      {},
      { campaigns: [alreadySent()] }
    );

    const result = await sendBroadcast("24b75e7d", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "duplicate_campaign" });
  });

  it("allows the same subject with a different body", async () => {
    const test = harness(
      row({
        id: "bc-2",
        subject: "Welcome to Indegenius",
        bodyHtml: "<p>A different message entirely.</p>",
        audienceKey: "all",
      }),
      {},
      { campaigns: [alreadySent()] }
    );

    const result = await sendBroadcast("bc-2", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: true, outcome: "dispatched" });
  });

  it("allows the same content to a materially different audience", async () => {
    const test = harness(
      row({ id: "bc-2", ...WELCOME, audienceKey: "authors" }),
      {},
      { campaigns: [alreadySent()] }
    );

    const result = await sendBroadcast("bc-2", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: true, outcome: "dispatched" });
  });

  it("allows a campaign whose equivalent is outside the window", async () => {
    // Nothing irreversible is on record any more, which is what "outside the
    // window" means to the statement: the row stops matching the recency
    // predicate and the claim proceeds exactly as it would have on day one.
    const test = harness(
      row({ id: "bc-2", ...WELCOME }),
      {},
      { campaigns: [alreadySent({ irreversible: false })] }
    );

    const result = await sendBroadcast("bc-2", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: true, outcome: "dispatched" });
  });

  it("lets exactly one of two racing equivalent campaigns through", async () => {
    // Two tabs, two rows, one campaign. The claim and the duplicate check
    // happen together against the same store, so the loser sees the winner's
    // claim rather than an empty table.
    const shared: CampaignRecord[] = [];
    const first = harness(row({ id: "bc-a", ...WELCOME }), {}, { campaigns: shared });
    const second = harness(row({ id: "bc-b", ...WELCOME }), {}, { campaigns: shared });

    // Both harnesses hold the same campaign store, which is what the advisory
    // lock gives the real implementation.
    const [a, b] = await Promise.all([
      sendBroadcast("bc-a", "admin-1", first.deps),
      sendBroadcast("bc-b", "admin-1", second.deps),
    ]);

    const outcomes = [a, b].map((result) => (result.ok ? result.outcome : result.reason));
    expect(outcomes).toContain("dispatched");
    expect(outcomes).toContain("duplicate_campaign");
    expect(
      first.calls.sendResendBroadcast.mock.calls.length +
        second.calls.sendResendBroadcast.mock.calls.length
    ).toBe(1);
  });

  it("sends anyway only when an override is passed explicitly", async () => {
    const test = harness(
      row({ id: "bc-2", ...WELCOME }),
      {},
      { campaigns: [alreadySent()] }
    );

    expect(await sendBroadcast("bc-2", "admin-1", test.deps)).toMatchObject({
      ok: false,
      reason: "duplicate_campaign",
    });

    const overridden = await sendBroadcast("bc-2", "admin-1", test.deps, {
      overrideDuplicate: true,
    });

    expect(overridden).toMatchObject({ ok: true, outcome: "dispatched" });
  });

  it("refuses a draft that has already been superseded", async () => {
    const test = harness(row({ status: "superseded" }));

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "superseded" });
    expect(test.calls.claimForCampaign).not.toHaveBeenCalled();
  });

  it("supersedes equivalent drafts only after the campaign actually went", async () => {
    const test = harness(row(WELCOME), {}, { supersedable: ["stale-draft-1"] });

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({
      ok: true,
      supersededBroadcastIds: ["stale-draft-1"],
    });
    expect(test.calls.supersedeEquivalentDrafts).toHaveBeenCalledWith({
      sentBroadcastId: "bc-1",
      fingerprint: campaignFingerprint(WELCOME),
    });
  });

  it("does not retire any draft when the send failed", async () => {
    const test = harness(
      row(WELCOME),
      {
        createResendBroadcast: async () => {
          throw new Error("network reset");
        },
      },
      { supersedable: ["stale-draft-1"] }
    );

    await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(test.calls.supersedeEquivalentDrafts).not.toHaveBeenCalled();
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
    expect(test.calls.claimForCampaign).not.toHaveBeenCalled();
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
    expect(test.calls.claimForCampaign).not.toHaveBeenCalled();
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

    expect(noSubject.calls.claimForCampaign).not.toHaveBeenCalled();
    expect(noBody.calls.claimForCampaign).not.toHaveBeenCalled();
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

  it("unlocks a validation rejection the provider still holds as a draft", async () => {
    // The production sequence: Resend refused the audience over a reserved
    // test domain, and its copy of the broadcast never left draft. Nothing was
    // sent, so the row must not be locked to a reconciliation that can only
    // ever confirm the same thing.
    let attempts = 0;
    const test = harness(row(), {
      // Rejected once, then accepted, which is what fixing the audience and
      // pressing send again looks like from here.
      sendResendBroadcast: async () => {
        attempts += 1;
        if (attempts > 1) return;
        throw new FakeResendError(
          "Resend broadcasts.send failed: The audience contains an invalid contact: preview.lane03.1781075745@example.com",
          422
        );
      },
    });
    test.calls.readProviderBroadcastStatus.mockResolvedValue("draft");

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "provider_rejected" });
    expect(test.calls.readProviderBroadcastStatus).toHaveBeenCalledWith(
      "resend-bc-1"
    );
    expect(test.calls.markFailed).not.toHaveBeenCalled();

    // Editable and claimable again, without a second Resend broadcast.
    expect(test.state.current.status).toBe("draft");
    expect(test.state.current.dispatchStartedAt).toBeNull();
    expect(test.state.current.resendBroadcastId).toBe("resend-bc-1");

    const retry = await sendBroadcast("bc-1", "admin-1", test.deps);
    expect(retry).toMatchObject({ ok: true, outcome: "dispatched" });
    expect(test.state.current.status).toBe("sending");
    // The same Resend draft went out. A second one was never created.
    expect(test.calls.createResendBroadcast).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
  });

  it("never unlocks a broadcast the provider has queued or sent", async () => {
    for (const providerStatus of ["queued", "sent"] as const) {
      const test = harness(row(), {
        sendResendBroadcast: async () => {
          throw new FakeResendError("Resend broadcasts.send failed: bad", 422);
        },
      });
      test.calls.readProviderBroadcastStatus.mockResolvedValue(providerStatus);

      const result = await sendBroadcast("bc-1", "admin-1", test.deps);

      expect(result).toMatchObject({ ok: false, reason: "needs_reconciliation" });
      expect(test.calls.releaseAfterRejection).not.toHaveBeenCalled();
      expect(test.state.current.dispatchStartedAt).not.toBeNull();

      const retry = await sendBroadcast("bc-1", "admin-1", test.deps);
      expect(retry).toMatchObject({ ok: false, reason: "already_dispatched" });
    }
  });

  it("keeps the lock when the provider's state cannot be read at all", async () => {
    const test = harness(row(), {
      sendResendBroadcast: async () => {
        throw new FakeResendError("Resend broadcasts.send failed: bad", 422);
      },
    });
    test.calls.readProviderBroadcastStatus.mockRejectedValue(
      new Error("gateway timeout")
    );

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    // Not knowing is the same as not being allowed to unlock.
    expect(result).toMatchObject({ ok: false, reason: "needs_reconciliation" });
    expect(test.state.current.dispatchStartedAt).not.toBeNull();
  });

  it("does not even ask the provider after a timeout or a 5xx", async () => {
    // Either could have been accepted on the way through, so the answer we
    // would get now proves nothing and the reconciler settles it later.
    for (const thrown of [
      new Error("network timeout"),
      new FakeResendError("Resend broadcasts.send failed: bad gateway", 502),
      new FakeResendError("Resend broadcasts.send failed: slow down", 429),
    ]) {
      const test = harness(row(), {
        sendResendBroadcast: async () => {
          throw thrown;
        },
      });
      test.calls.readProviderBroadcastStatus.mockResolvedValue("draft");

      const result = await sendBroadcast("bc-1", "admin-1", test.deps);

      expect(result).toMatchObject({ ok: false, reason: "needs_reconciliation" });
      expect(test.calls.readProviderBroadcastStatus).not.toHaveBeenCalled();
      expect(test.state.current.dispatchStartedAt).not.toBeNull();
    }
  });

  it("falls back to reconciliation when the release matches no row", async () => {
    // Something else moved the row between the rejection and the release, so
    // this caller no longer owns the claim it is trying to give back.
    const test = harness(row(), {
      sendResendBroadcast: async () => {
        throw new FakeResendError("Resend broadcasts.send failed: bad", 422);
      },
      releaseAfterRejection: async () => false,
    });
    test.calls.readProviderBroadcastStatus.mockResolvedValue("draft");

    const result = await sendBroadcast("bc-1", "admin-1", test.deps);

    expect(result).toMatchObject({ ok: false, reason: "needs_reconciliation" });
    expect(test.calls.markFailed).toHaveBeenCalled();
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
