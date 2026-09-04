import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store is where the send path meets Supabase and Resend. What is worth
 * pinning down here is the shape of the queries rather than Postgres itself:
 * that a save cannot touch a dispatched row, that a hand-picked segment is
 * created once and reused, and that staleness fails closed.
 */

const { adminState, ensureNamedSegmentMock, syncContactSegmentsMock, getResendBroadcastMock } =
  vi.hoisted(() => ({
    adminState: {
      tables: {} as Record<string, unknown[]>,
      updates: [] as { table: string; patch: Record<string, unknown>; filters: string[] }[],
      rpcCalls: [] as { name: string; args: unknown }[],
      rpcResults: {} as Record<string, { data: unknown; error: unknown }>,
    },
    ensureNamedSegmentMock: vi.fn(),
    syncContactSegmentsMock: vi.fn(),
    getResendBroadcastMock: vi.fn(),
  }));

vi.mock("@/lib/resendBroadcasts", () => ({
  createResendBroadcast: vi.fn(),
  sendResendBroadcast: vi.fn(),
  ensureNamedSegment: ensureNamedSegmentMock,
  syncContactSegments: syncContactSegmentsMock,
  getResendBroadcast: getResendBroadcastMock,
  selectedSegmentName: (id: string) => `Indegenius: Broadcast ${id.slice(0, 8)}`,
}));

/**
 * A PostgREST-shaped stub. It records the filters a query applied rather than
 * evaluating them, because what these tests are checking is that the guard
 * clauses are present, not that Postgres honours them.
 */
function makeQuery(table: string, mode: "select" | "update" | "insert") {
  const filters: string[] = [];
  let patch: Record<string, unknown> = {};

  const query: Record<string, unknown> = {
    filters,
    select: () => query,
    insert: (values: Record<string, unknown>) => {
      patch = values;
      return query;
    },
    update: (values: Record<string, unknown>) => {
      patch = values;
      adminState.updates.push({ table, patch: values, filters });
      return query;
    },
    upsert: () => query,
    eq: (column: string, value: unknown) => {
      filters.push(`eq:${column}:${String(value)}`);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push(`in:${column}:${values.join(",")}`);
      return query;
    },
    is: (column: string, value: unknown) => {
      filters.push(`is:${column}:${String(value)}`);
      return query;
    },
    not: (column: string, op: string, value: unknown) => {
      filters.push(`not:${column}:${op}:${String(value)}`);
      return query;
    },
    gt: () => query,
    gte: () => query,
    lt: () => query,
    order: () => query,
    limit: () => query,
    range: () => query,
    maybeSingle: async () => ({
      data: (adminState.tables[table] ?? [])[0] ?? null,
      error: null,
    }),
    single: async () => ({
      data: (adminState.tables[table] ?? [])[0] ?? null,
      error: null,
    }),
    then: (resolve: (value: { data: unknown; error: null; count: number }) => unknown) => {
      const rows = adminState.tables[table] ?? [];
      return Promise.resolve(
        resolve({
          data: mode === "select" ? rows : rows.slice(0, 1),
          error: null,
          count: rows.length,
        })
      );
    },
  };

  void patch;
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => makeQuery(table, "select"),
      update: (values: Record<string, unknown>) =>
        makeQuery(table, "update").update(values),
      insert: (values: Record<string, unknown>) =>
        makeQuery(table, "insert").insert(values),
      upsert: async () => ({ data: null, error: null }),
    }),
    rpc: async (name: string, args: unknown) => {
      adminState.rpcCalls.push({ name, args });
      return adminState.rpcResults[name] ?? { data: null, error: null };
    },
  }),
  AdminAccessError: class extends Error {},
}));

const store = await import("@/lib/broadcastStore");
const { isSegmentStale } = await import("@/lib/broadcastSend");

function sendRow(overrides = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    subject: "Subject",
    previewText: "",
    bodyHtml: "<p>Body</p>",
    senderKey: "platform" as const,
    audienceKey: "selected" as const,
    selectedProfileIds: ["p1", "p2"],
    status: "queued" as const,
    resendBroadcastId: null,
    selectedSegmentId: null,
    dispatchStartedAt: null,
    recipientCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  adminState.tables = {};
  adminState.updates = [];
  adminState.rpcCalls = [];
  adminState.rpcResults = {};
  ensureNamedSegmentMock.mockReset();
  syncContactSegmentsMock.mockReset();
  getResendBroadcastMock.mockReset();
  ensureNamedSegmentMock.mockResolvedValue({ id: "seg-new", created: true });
  syncContactSegmentsMock.mockResolvedValue({ id: "contact-1", created: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("draft persistence", () => {
  it("refuses to save over a broadcast that has been dispatched", async () => {
    adminState.tables.broadcasts = [];

    const result = await store.saveDraft("bc-1", {
      subject: "Edited",
      previewText: "",
      bodyHtml: "<p>Edited</p>",
      senderKey: "platform",
      audienceKey: "all",
      selectedProfileIds: [],
    });

    expect(result).toBe("locked");

    // The guard is two clauses: an editable status, and no dispatch on record.
    // Status alone is not enough, because a post-dispatch failure reads as
    // 'failed', which is otherwise editable.
    const update = adminState.updates.find((u) => u.table === "broadcasts");
    expect(update?.filters).toContain("in:status:draft,failed");
    expect(update?.filters).toContain("is:dispatch_started_at:null");
  });

  it("reports a save that landed", async () => {
    adminState.tables.broadcasts = [{ id: "bc-1" }];

    const result = await store.saveDraft("bc-1", {
      subject: "Edited",
      previewText: "",
      bodyHtml: "<p>Edited</p>",
      senderKey: "platform",
      audienceKey: "all",
      selectedProfileIds: [],
    });

    expect(result).toBe("saved");
  });
});

describe("claiming a send", () => {
  it("goes through the database function rather than a client-side update", async () => {
    // Two racing callers must not both win, which needs one statement in
    // Postgres. A read-then-write from the route would let both through.
    adminState.rpcResults.claim_broadcast_for_send = { data: [], error: null };

    const claimed = await store.claimForSend("bc-1", "admin-1");

    expect(claimed).toBeNull();
    expect(adminState.rpcCalls[0]).toMatchObject({
      name: "claim_broadcast_for_send",
      args: { p_broadcast_id: "bc-1", p_actor_id: "admin-1" },
    });
  });
});

describe("the hand-picked segment", () => {
  it("creates one segment and records it against the broadcast", async () => {
    adminState.tables.broadcast_contacts = [
      { email: "a@example.com" },
      { email: "b@example.com" },
    ];

    const result = await store.resolveSendSegment(sendRow(), new Date());

    expect(result).toMatchObject({ ok: true, segmentId: "seg-new", recipientCount: 2 });
    expect(ensureNamedSegmentMock).toHaveBeenCalledTimes(1);

    const update = adminState.updates.find(
      (u) => u.table === "broadcasts" && "selected_segment_id" in u.patch
    );
    expect(update?.patch.selected_segment_id).toBe("seg-new");
  });

  it("reuses the recorded segment instead of making a second", async () => {
    // A retry after a timeout must not leave an orphan segment at Resend, and
    // must not re-push every contact into a fresh one.
    adminState.tables.broadcast_contacts = [{ email: "a@example.com" }];

    const result = await store.resolveSendSegment(
      sendRow({ selectedSegmentId: "seg-existing" }),
      new Date()
    );

    expect(result).toMatchObject({ ok: true, segmentId: "seg-existing" });
    expect(ensureNamedSegmentMock).not.toHaveBeenCalled();
  });

  it("names the segment after the broadcast, so even a lost id finds it again", async () => {
    adminState.tables.broadcast_contacts = [{ email: "a@example.com" }];

    await store.resolveSendSegment(sendRow(), new Date());

    expect(ensureNamedSegmentMock).toHaveBeenCalledWith(
      "Indegenius: Broadcast 11111111"
    );
  });

  it("refuses when nobody selected is still eligible", async () => {
    adminState.tables.broadcast_contacts = [];

    const result = await store.resolveSendSegment(sendRow(), new Date());

    expect(result).toMatchObject({ ok: false, reason: "no_recipients" });
    expect(ensureNamedSegmentMock).not.toHaveBeenCalled();
  });

  it("counts only eligible contacts, so an opt-out is never in the segment", async () => {
    adminState.tables.broadcast_contacts = [{ email: "a@example.com" }];

    const result = await store.resolveSendSegment(
      sendRow({ selectedProfileIds: ["p1", "p2", "p3"] }),
      new Date()
    );

    // Three were ticked; one is eligible. The eligible one is what gets sent.
    expect(result).toMatchObject({ ok: true, recipientCount: 1 });
    expect(syncContactSegmentsMock).toHaveBeenCalledTimes(1);
  });

  it("never lifts a provider unsubscribe while building a send segment", async () => {
    adminState.tables.broadcast_contacts = [{ email: "a@example.com" }];

    await store.resolveSendSegment(sendRow(), new Date());

    expect(syncContactSegmentsMock.mock.calls[0][0].resubscribe).toBeUndefined();
  });
});

describe("reconciling a stranded send", () => {
  function dbRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4",
      subject: "Subject",
      preview_text: "",
      body_html: "<p>Body</p>",
      sender_key: "platform",
      audience_key: "all",
      selected_profile_ids: [],
      selected_segment_id: null,
      status: "failed",
      resend_broadcast_id: "807c168c-6fd5-42c3-9ae0-977bd6869364",
      dispatch_started_at: "2026-09-03T10:00:00Z",
      recipient_count: 1200,
      delivered_count: 0,
      failed_count: 0,
      status_note: "Resend rejected the audience.",
      created_by: null,
      sent_by: null,
      sent_at: null,
      created_at: "2026-09-03T09:00:00Z",
      updated_at: "2026-09-03T10:00:00Z",
      ...overrides,
    };
  }

  const RELEASE_RPC = "release_broadcast_after_provider_draft";

  /** The unlock now happens in one statement in Postgres, so it is an RPC. */
  function releaseCall() {
    return adminState.rpcCalls.find((call) => call.name === RELEASE_RPC);
  }

  function releaseSucceeds() {
    adminState.rpcResults[RELEASE_RPC] = { data: [{ id: "x" }], error: null };
  }

  it("unlocks a failed broadcast the provider still holds as a draft", async () => {
    // The production sequence, with the status the live row actually had.
    // Resend answered 200 with status draft for this exact broadcast and the
    // local row stayed failed and locked, because the unlock was a PostgREST
    // update whose guard could fail without saying so.
    adminState.tables.broadcasts = [dbRow()];
    getResendBroadcastMock.mockResolvedValue({
      id: "807c168c-6fd5-42c3-9ae0-977bd6869364",
      status: "draft",
    });
    releaseSucceeds();

    const outcomes = await store.reconcileStuckBroadcasts();

    // The guard travels with the call rather than being assembled from
    // filters, and it names the Resend id whose status was the evidence.
    expect(releaseCall()?.args).toMatchObject({
      p_broadcast_id: "c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4",
      p_resend_broadcast_id: "807c168c-6fd5-42c3-9ae0-977bd6869364",
      p_status_note: store.PROVIDER_DRAFT_RELEASE_NOTE,
    });

    // Exactly the transition the live row needs: failed and stamped, to an
    // editable draft, keeping the Resend id it already has.
    expect(outcomes).toContainEqual({
      broadcastId: "c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4",
      from: "failed",
      to: "draft",
      providerStatus: "draft",
      reason: "released_provider_draft",
    });
    expect(store.settledBroadcasts(outcomes)).toContainEqual(
      expect.objectContaining({
        broadcastId: "c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4",
      })
    );
  });

  it("unlocks a row stranded in queued or sending just the same", async () => {
    for (const status of ["queued", "sending"] as const) {
      adminState.rpcCalls = [];
      adminState.tables.broadcasts = [dbRow({ status })];
      getResendBroadcastMock.mockResolvedValue({ status: "draft" });
      releaseSucceeds();

      const outcomes = await store.reconcileStuckBroadcasts();

      expect(releaseCall()).toBeDefined();
      expect(outcomes[0]).toMatchObject({ from: status, to: "draft" });
    }
  });

  it("reports a release that matched nothing rather than claiming success", async () => {
    // The failure this whole path exists to make visible: the statement ran,
    // the row did not move, and nothing said so.
    adminState.tables.broadcasts = [dbRow()];
    getResendBroadcastMock.mockResolvedValue({ status: "draft" });
    adminState.rpcResults[RELEASE_RPC] = { data: [], error: null };

    const outcomes = await store.reconcileStuckBroadcasts();

    expect(outcomes[0]).toMatchObject({
      to: null,
      providerStatus: "draft",
      reason: "release_matched_nothing",
    });
    // The statement ran and is reported as having run, which is the whole
    // point: silence is what made the live failure impossible to diagnose.
    expect(releaseCall()).toBeDefined();
  });

  it("never releases a broadcast the provider has queued", async () => {
    adminState.tables.broadcasts = [dbRow({ status: "sending" })];
    getResendBroadcastMock.mockResolvedValue({ status: "queued" });
    releaseSucceeds();

    const outcomes = await store.reconcileStuckBroadcasts();

    expect(releaseCall()).toBeUndefined();
    expect(outcomes[0]).toMatchObject({ to: null, reason: "provider_queued" });
  });

  it("never releases a broadcast the provider sent", async () => {
    adminState.tables.broadcasts = [dbRow()];
    getResendBroadcastMock.mockResolvedValue({
      status: "sent",
      sent_at: "2026-09-03T10:01:00Z",
    });
    releaseSucceeds();

    const outcomes = await store.reconcileStuckBroadcasts();

    expect(releaseCall()).toBeUndefined();

    // It is corrected forward to sending, not backwards to a draft.
    const update = adminState.updates.find(
      (u) => u.table === "broadcasts" && u.patch.status === "sending"
    );
    expect(update?.patch.sent_at).toBe("2026-09-03T10:01:00Z");
    expect(outcomes[0]).toMatchObject({ to: "sending", reason: "marked_sending" });
  });

  it("leaves the row alone when the provider cannot account for it", async () => {
    // getResendBroadcast answers null for a broadcast Resend does not have.
    // Not knowing is not permission to unlock.
    adminState.tables.broadcasts = [dbRow()];
    getResendBroadcastMock.mockResolvedValue(null);
    releaseSucceeds();

    const outcomes = await store.reconcileStuckBroadcasts();

    expect(releaseCall()).toBeUndefined();
    expect(outcomes[0]).toMatchObject({
      to: null,
      providerStatus: "unknown",
      reason: "provider_unreadable",
    });
  });

  it("records a lookup failure and carries on with the rest of the batch", async () => {
    // One unreadable broadcast used to abandon the whole reconciliation, and
    // with it every other stranded row behind it.
    adminState.tables.broadcasts = [dbRow()];
    getResendBroadcastMock.mockRejectedValue(new Error("gateway timeout"));
    releaseSucceeds();

    const outcomes = await store.reconcileStuckBroadcasts();

    expect(releaseCall()).toBeUndefined();
    expect(outcomes[0]).toMatchObject({
      to: null,
      providerStatus: "unknown",
      reason: "provider_unreadable",
    });
  });

  it("only looks at rows that were dispatched and have gone quiet", async () => {
    adminState.tables.broadcasts = [];

    await store.reconcileStuckBroadcasts();

    const scan = adminState.updates.find(
      (u) => u.table === "broadcasts" && !("dispatch_started_at" in u.patch)
    );
    // The bulk release at the end is the other half: a claim that never
    // reached Resend at all goes back to being a draft.
    expect(scan?.filters).toContain("eq:status:queued");
    expect(scan?.filters).toContain("is:dispatch_started_at:null");
  });
});

describe("releasing a claim after a provider rejection", () => {
  it("goes through one statement in Postgres, not a chain of filters", async () => {
    // The same argument claim_broadcast_for_send is built on. A guard over a
    // nullable column assembled from separate PostgREST filters can match
    // nothing and report no error, which is how a locked broadcast stayed
    // locked through a reconciliation that looked like it had run.
    adminState.rpcResults.release_broadcast_after_provider_draft = {
      data: [{ id: "bc-1" }],
      error: null,
    };

    const released = await store.releaseAfterRejection({
      id: "bc-1",
      resendBroadcastId: "resend-bc-1",
      note: "Resend rejected the audience.",
    });

    expect(released).toBe(true);
    expect(adminState.rpcCalls[0]).toMatchObject({
      name: "release_broadcast_after_provider_draft",
      args: {
        p_broadcast_id: "bc-1",
        p_resend_broadcast_id: "resend-bc-1",
        p_status_note: "Resend rejected the audience.",
      },
    });
    expect(adminState.updates).toHaveLength(0);
  });

  it("reports false when it matched nothing, so the caller reconciles instead", async () => {
    adminState.rpcResults.release_broadcast_after_provider_draft = {
      data: [],
      error: null,
    };

    expect(
      await store.releaseAfterRejection({
        id: "bc-1",
        resendBroadcastId: "resend-bc-1",
        note: "rejected",
      })
    ).toBe(false);
  });
});

describe("reading the provider's own status", () => {
  it("passes through the three words Resend actually uses", async () => {
    for (const status of ["draft", "queued", "sent"] as const) {
      getResendBroadcastMock.mockResolvedValue({ status });
      expect(await store.readProviderBroadcastStatus("resend-bc-1")).toBe(status);
    }
  });

  it("answers unknown for a broadcast Resend cannot find", async () => {
    getResendBroadcastMock.mockResolvedValue(null);
    expect(await store.readProviderBroadcastStatus("resend-bc-1")).toBe("unknown");
  });

  it("answers unknown for a status word it does not recognise", async () => {
    getResendBroadcastMock.mockResolvedValue({ status: "scheduled" });
    expect(await store.readProviderBroadcastStatus("resend-bc-1")).toBe("unknown");
  });
});

describe("standing segment freshness", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const fresh = "2026-09-02T06:00:00Z";

  function segment(overrides = {}) {
    return {
      audience_key: "all",
      resend_segment_id: "seg-all",
      contact_count: 10,
      last_synced_at: fresh,
      last_sync_error: null,
      ...overrides,
    };
  }

  const allFive = ["all", "active", "authors", "verified", "new"].map((key) =>
    segment({ audience_key: key, resend_segment_id: `seg-${key}` })
  );

  it("accepts a full set of freshly synced segments", () => {
    expect(store.standingSegmentsStale(allFive, now)).toBe(false);
  });

  it("is stale when one segment has never synced", () => {
    // Taking the oldest date present would skip the audience that was never
    // built at all, which is the one most worth warning about.
    const withNull = allFive.map((s, index) =>
      index === 2 ? { ...s, last_synced_at: null } : s
    );

    expect(store.standingSegmentsStale(withNull, now)).toBe(true);
  });

  it("is stale when one segment has no Resend id", () => {
    const missingId = allFive.map((s, index) =>
      index === 1 ? { ...s, resend_segment_id: null } : s
    );

    expect(store.standingSegmentsStale(missingId, now)).toBe(true);
  });

  it("is stale when a segment is older than the window", () => {
    const old = allFive.map((s, index) =>
      index === 0 ? { ...s, last_synced_at: "2026-08-01T00:00:00Z" } : s
    );

    expect(store.standingSegmentsStale(old, now)).toBe(true);
    expect(isSegmentStale("2026-08-01T00:00:00Z", now)).toBe(true);
  });

  it("is stale when a whole audience row is missing", () => {
    expect(store.standingSegmentsStale(allFive.slice(0, 3), now)).toBe(true);
  });

  it("is stale when nothing has ever been provisioned", () => {
    expect(store.standingSegmentsStale([], now)).toBe(true);
  });
});
