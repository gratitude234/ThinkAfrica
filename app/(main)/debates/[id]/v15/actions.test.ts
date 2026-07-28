import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeFakeSupabase,
  queueResults,
} from "@/lib/testUtils/supabaseMock";

const state = vi.hoisted(() => ({
  client: null as ReturnType<typeof makeFakeSupabase> | null,
  admin: null as ReturnType<typeof makeFakeSupabase> | null,
  deliver: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => state.client),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => state.admin),
}));

vi.mock("@/lib/debateV15Delivery", () => ({
  deliverDebateV15Event: state.deliver,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  advanceDebatePhaseV15Action,
  cancelDebateV15Action,
  inviteDebaterV15Action,
  respondToDebateInvitationV15Action,
  revokeDebateInvitationV15Action,
  startDebateV15Action,
} from "./actions";

function clientWithRpc(
  name: string,
  data: Record<string, unknown>,
  userId = "moderator-1"
) {
  return makeFakeSupabase({}, userId, {
    [name]: () => ({ data, error: null }),
  });
}

function debateRow(overrides: Record<string, unknown> = {}) {
  return {
    title: "African universities should teach entrepreneurship",
    moderator_id: "moderator-1",
    cancellation_reason: null,
    ...overrides,
  };
}

describe("Debate V1.5 lifecycle delivery actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.client = null;
    state.admin = null;
  });

  it("delivers an invitation to the RPC-authoritative recipient and stance", async () => {
    state.client = clientWithRpc("invite_debater_v1_5", {
      outcome: "invited",
      user_id: "invitee-1",
      stance: "for",
    });
    state.admin = makeFakeSupabase({
      debates: queueResults({ data: debateRow(), error: null }),
    });

    const result = await inviteDebaterV15Action(
      "debate-1",
      "untrusted-client-id",
      "against"
    );

    expect(result).toEqual({
      ok: true,
      message:
        "Invitation recorded. They’ll receive an in-app alert, plus email and push where enabled.",
    });
    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "invitation",
        recipientId: "invitee-1",
        stance: "for",
        debateId: "debate-1",
      })
    );
  });

  it("notifies the moderator when an invitee accepts", async () => {
    state.client = clientWithRpc(
      "respond_to_debate_invitation_v1_5",
      { outcome: "accepted", status: "accepted", stance: "against" },
      "invitee-1"
    );
    state.admin = makeFakeSupabase({
      debates: queueResults({ data: debateRow(), error: null }),
      profiles: queueResults({
        data: { full_name: "Amina Okafor", username: "amina" },
        error: null,
      }),
    });

    const result = await respondToDebateInvitationV15Action("debate-1", true);

    expect(result).toEqual({ ok: true });
    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "invitation_response",
        recipientId: "moderator-1",
        participantName: "Amina Okafor",
        response: "accepted",
      })
    );
  });

  it("delivers a withdrawal to the removed RPC recipient", async () => {
    state.client = clientWithRpc("revoke_debate_invitation_v1_5", {
      outcome: "revoked",
      user_id: "invitee-2",
      stance: "against",
    });
    state.admin = makeFakeSupabase({
      debates: queueResults({ data: debateRow(), error: null }),
    });

    await revokeDebateInvitationV15Action("debate-1", "for");

    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "invitation_withdrawn",
        recipientId: "invitee-2",
        stance: "against",
      })
    );
  });

  it("notifies both accepted debaters when opening starts", async () => {
    state.client = clientWithRpc("start_debate_v1_5", {
      outcome: "started",
      current_phase: "opening",
    });
    state.admin = makeFakeSupabase({
      debates: queueResults({ data: debateRow(), error: null }),
      debate_slots_v1_5: queueResults({
        data: [
          { user_id: "for-user", stance: "for", status: "accepted" },
          { user_id: "against-user", stance: "against", status: "accepted" },
          { user_id: "declined-user", stance: "for", status: "declined" },
        ],
        error: null,
      }),
    });

    await startDebateV15Action("debate-1");

    expect(state.deliver).toHaveBeenCalledTimes(2);
    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "phase_opened",
        recipientId: "for-user",
        phase: "opening",
      })
    );
    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "phase_opened",
        recipientId: "against-user",
        phase: "opening",
      })
    );
  });

  it.each([
    ["opening", "rebuttal"],
    ["rebuttal", "voting"],
  ] as const)(
    "notifies accepted debaters when %s advances to %s",
    async (expectedPhase, currentPhase) => {
      state.client = clientWithRpc("advance_debate_phase_v1_5", {
        outcome: "advanced",
        current_phase: currentPhase,
      });
      state.admin = makeFakeSupabase({
        debates: queueResults({ data: debateRow(), error: null }),
        debate_slots_v1_5: queueResults({
          data: [
            { user_id: "for-user", stance: "for", status: "accepted" },
            { user_id: "against-user", stance: "against", status: "accepted" },
          ],
          error: null,
        }),
      });

      await advanceDebatePhaseV15Action("debate-1", expectedPhase);

      expect(state.deliver).toHaveBeenCalledTimes(2);
      expect(state.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "phase_opened",
          phase: currentPhase,
        })
      );
    }
  );

  it("notifies only invited or accepted non-actors when cancelled", async () => {
    state.client = clientWithRpc("cancel_debate_v1_5", {
      outcome: "cancelled",
      reason: "Scheduling conflict",
    });
    state.admin = makeFakeSupabase({
      debates: queueResults({
        data: debateRow({ cancellation_reason: "Scheduling conflict" }),
        error: null,
      }),
      debate_slots_v1_5: queueResults({
        data: [
          { user_id: "for-user", stance: "for", status: "accepted" },
          { user_id: "against-user", stance: "against", status: "invited" },
          { user_id: "declined-user", stance: "for", status: "declined" },
          { user_id: "moderator-1", stance: "against", status: "accepted" },
        ],
        error: null,
      }),
    });

    await cancelDebateV15Action("debate-1", "client reason");

    expect(state.deliver).toHaveBeenCalledTimes(2);
    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cancelled",
        recipientId: "for-user",
        reason: "Scheduling conflict",
      })
    );
    expect(state.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "cancelled",
        recipientId: "against-user",
      })
    );
  });

  it.each([
    ["invite_debater_v1_5", inviteDebaterV15Action, ["debate-1", "user-1", "for"]],
    [
      "respond_to_debate_invitation_v1_5",
      respondToDebateInvitationV15Action,
      ["debate-1", true],
    ],
    [
      "revoke_debate_invitation_v1_5",
      revokeDebateInvitationV15Action,
      ["debate-1", "for"],
    ],
    ["start_debate_v1_5", startDebateV15Action, ["debate-1"]],
    [
      "advance_debate_phase_v1_5",
      advanceDebatePhaseV15Action,
      ["debate-1", "opening"],
    ],
    ["cancel_debate_v1_5", cancelDebateV15Action, ["debate-1", "reason"]],
  ] as const)(
    "does not deliver after a stale %s outcome",
    async (rpcName, action, args) => {
      state.client = clientWithRpc(rpcName, {
        outcome: "stale_no_op",
        current_phase: "recruiting",
      });
      state.admin = makeFakeSupabase({});

      await (action as (...input: never[]) => Promise<unknown>)(
        ...(args as never[])
      );

      expect(state.deliver).not.toHaveBeenCalled();
    }
  );

  it.each([
    [
      "respond_to_debate_invitation_v1_5",
      { outcome: "already_accepted", status: "accepted" },
      respondToDebateInvitationV15Action,
      ["debate-1", true],
    ],
    [
      "revoke_debate_invitation_v1_5",
      { outcome: "already_empty", stance: "for" },
      revokeDebateInvitationV15Action,
      ["debate-1", "for"],
    ],
    [
      "cancel_debate_v1_5",
      { outcome: "already_cancelled" },
      cancelDebateV15Action,
      ["debate-1", "reason"],
    ],
  ] as const)(
    "does not deliver for an already-applied %s outcome",
    async (rpcName, rpcData, action, args) => {
      state.client = clientWithRpc(rpcName, rpcData);
      state.admin = makeFakeSupabase({});

      await (action as (...input: never[]) => Promise<unknown>)(
        ...(args as never[])
      );

      expect(state.deliver).not.toHaveBeenCalled();
    }
  );

  it("keeps the invitation successful when delivery throws", async () => {
    state.client = clientWithRpc("invite_debater_v1_5", {
      outcome: "invited",
      user_id: "invitee-1",
      stance: "for",
    });
    state.admin = makeFakeSupabase({
      debates: queueResults({ data: debateRow(), error: null }),
    });
    state.deliver.mockRejectedValueOnce(new Error("provider unavailable"));

    const result = await inviteDebaterV15Action(
      "debate-1",
      "invitee-1",
      "for"
    );

    expect(result.ok).toBe(true);
  });
});
