import { describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const fakeClient = { rpc: rpcMock };

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => fakeClient),
}));

import { loadDebateV2RoomSignal } from "./loadRoomSignal";

function baseRpcRow(overrides: Record<string, unknown> = {}) {
  return {
    debate_status: "active",
    closure_kind: null,
    rounds: [{ id: "round-1", status: "active", ends_at: "2026-07-17T00:30:00.000Z" }],
    argument_count: 2,
    reaction_count: 3,
    reaction_latest_created_at: "2026-07-17T00:05:00.000Z",
    cross_exchange_count: 1,
    cross_exchange_latest_updated_at: "2026-07-17T00:07:00.000Z",
    membership_count: 4,
    can_manage: false,
    initial_ballot_count: 5,
    initial_ballot_latest_updated_at: "2026-07-17T00:10:00.000Z",
    final_ballot_count: null,
    final_ballot_latest_updated_at: null,
    ...overrides,
  };
}

describe("loadDebateV2RoomSignal", () => {
  it("calls the single consolidated RPC with the debate id", async () => {
    rpcMock.mockResolvedValue({ data: baseRpcRow(), error: null });

    const signal = await loadDebateV2RoomSignal("debate-1");

    expect(rpcMock).toHaveBeenCalledWith("get_debate_room_signal_v2", { p_debate_id: "debate-1" });
    expect(signal).toEqual({
      debateStatus: "active",
      closureKind: null,
      rounds: [{ id: "round-1", status: "active", endsAt: "2026-07-17T00:30:00.000Z" }],
      argumentCount: 2,
      reactionCount: 3,
      reactionLatestCreatedAt: "2026-07-17T00:05:00.000Z",
      crossExchangeCount: 1,
      crossExchangeLatestUpdatedAt: "2026-07-17T00:07:00.000Z",
      membershipCount: 4,
      canManage: false,
      initialBallotCount: 5,
      initialBallotLatestUpdatedAt: "2026-07-17T00:10:00.000Z",
      finalBallotCount: null,
      finalBallotLatestUpdatedAt: null,
    });
  });

  it("passes through per-stage ballot fields as null when the RPC withholds them (caller can't see that stage yet)", async () => {
    // The RPC itself enforces this visibility gate server-side (see the
    // migration) -- at the JS boundary this just confirms the wrapper
    // doesn't invent a value where the RPC deliberately returned none.
    rpcMock.mockResolvedValue({
      data: baseRpcRow({ initial_ballot_count: null, initial_ballot_latest_updated_at: null }),
      error: null,
    });

    const signal = await loadDebateV2RoomSignal("debate-1");

    expect(signal?.initialBallotCount).toBeNull();
    expect(signal?.initialBallotLatestUpdatedAt).toBeNull();
  });

  it("passes through cross-examination fields unfiltered -- they are public data and need no visibility gating", async () => {
    rpcMock.mockResolvedValue({
      data: baseRpcRow({ cross_exchange_count: 4, cross_exchange_latest_updated_at: "2026-07-17T00:20:00.000Z" }),
      error: null,
    });

    const signal = await loadDebateV2RoomSignal("debate-1");

    expect(signal?.crossExchangeCount).toBe(4);
    expect(signal?.crossExchangeLatestUpdatedAt).toBe("2026-07-17T00:20:00.000Z");
  });

  it("passes through can_manage as computed live by the RPC (catches moderator reassignment)", async () => {
    rpcMock.mockResolvedValue({ data: baseRpcRow({ can_manage: true }), error: null });

    const signal = await loadDebateV2RoomSignal("debate-1");

    expect(signal?.canManage).toBe(true);
  });

  it("returns null for a not-found/not-V2 debate (the RPC returns SQL NULL, not an error)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(loadDebateV2RoomSignal("debate-1")).resolves.toBeNull();
  });

  it("throws on a genuine RPC failure rather than treating it as not-found", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(loadDebateV2RoomSignal("debate-1")).rejects.toThrow(/room signal/);
  });
});
