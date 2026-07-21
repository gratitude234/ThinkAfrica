import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();
const adminRpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock }, rpc: rpcMock })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: adminRpcMock })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  activateDebateV2Action,
  submitCrossExaminationAnswerV2Action,
  submitCrossExaminationQuestionV2Action,
} from "./actions";

describe("activateDebateV2Action", () => {
  const originalEnv = process.env.DEBATE_V2_ACTIVATION_ENABLED;

  beforeEach(() => {
    getUserMock.mockReset();
    adminRpcMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: "mod-1" } } });
    adminRpcMock.mockResolvedValue({ data: { activated: true }, error: null });
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DEBATE_V2_ACTIVATION_ENABLED;
    else process.env.DEBATE_V2_ACTIVATION_ENABLED = originalEnv;
  });

  it("refuses to activate while the feature is disabled, without even checking who's calling", async () => {
    delete process.env.DEBATE_V2_ACTIVATION_ENABLED;

    const result = await activateDebateV2Action("debate-1");

    expect(result).toEqual({ ok: false, error: "Debate V2 activation is not yet enabled." });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("also refuses when the flag is set to something other than the literal '1'", async () => {
    process.env.DEBATE_V2_ACTIVATION_ENABLED = "true";

    const result = await activateDebateV2Action("debate-1");

    expect(result.ok).toBe(false);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("proceeds to call activate_debate_v2 with the session-derived actor once the feature is enabled", async () => {
    process.env.DEBATE_V2_ACTIVATION_ENABLED = "1";

    const result = await activateDebateV2Action("debate-1");

    expect(result.ok).toBe(true);
    expect(adminRpcMock).toHaveBeenCalledWith("activate_debate_v2", {
      p_debate_id: "debate-1",
      p_actor_id: "mod-1",
      p_opening_starts_at: null,
    });
  });

  it("still requires a signed-in session even when the feature is enabled", async () => {
    process.env.DEBATE_V2_ACTIVATION_ENABLED = "1";
    getUserMock.mockResolvedValue({ data: { user: null } });

    const result = await activateDebateV2Action("debate-1");

    expect(result).toEqual({ ok: false, error: "You must be signed in." });
    expect(adminRpcMock).not.toHaveBeenCalled();
  });
});

describe("submitCrossExaminationQuestionV2Action", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("maps input fields to the RPC's exact parameter names", async () => {
    rpcMock.mockResolvedValue({
      data: { exchange_id: "exchange-1", debate_id: "debate-1", round_id: "round-3", target_id: "target-1", target_argument_id: null },
      error: null,
    });

    await submitCrossExaminationQuestionV2Action({
      debateId: "debate-1",
      targetUserId: "target-1",
      question: "Why do you believe that?",
    });

    expect(rpcMock).toHaveBeenCalledWith("submit_cross_examination_question_v2", {
      p_debate_id: "debate-1",
      p_target_user_id: "target-1",
      p_question: "Why do you believe that?",
      p_target_argument_id: null,
    });
  });

  it("passes an optional target_argument_id through when supplied", async () => {
    rpcMock.mockResolvedValue({ data: { exchange_id: "exchange-1" }, error: null });

    await submitCrossExaminationQuestionV2Action({
      debateId: "debate-1",
      targetUserId: "target-1",
      question: "Why do you believe that?",
      targetArgumentId: "arg-1",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "submit_cross_examination_question_v2",
      expect.objectContaining({ p_target_argument_id: "arg-1" })
    );
  });

  it("sanitizes a P0001 RPC rejection into its message, and never reveals raw error internals", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "P0001", message: "The target must have the opposing stance." } });

    const result = await submitCrossExaminationQuestionV2Action({
      debateId: "debate-1",
      targetUserId: "target-1",
      question: "Why?",
    });

    expect(result).toEqual({ ok: false, error: "The target must have the opposing stance." });
  });

  it("falls back to a generic message for a non-P0001 (unexpected) error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const result = await submitCrossExaminationQuestionV2Action({
      debateId: "debate-1",
      targetUserId: "target-1",
      question: "Why?",
    });

    expect(result).toEqual({ ok: false, error: "Something went wrong. Please try again." });
  });
});

describe("submitCrossExaminationAnswerV2Action", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("maps input fields to the RPC's exact parameter names", async () => {
    rpcMock.mockResolvedValue({
      data: { exchange_id: "exchange-1", debate_id: "debate-1", already_answered: false },
      error: null,
    });

    await submitCrossExaminationAnswerV2Action({
      debateId: "debate-1",
      exchangeId: "exchange-1",
      answer: "Because the evidence supports it.",
    });

    expect(rpcMock).toHaveBeenCalledWith("submit_cross_examination_answer_v2", {
      p_debate_id: "debate-1",
      p_exchange_id: "exchange-1",
      p_answer: "Because the evidence supports it.",
    });
  });

  it("surfaces an idempotent already_answered outcome from the RPC without treating it as an error", async () => {
    rpcMock.mockResolvedValue({
      data: { exchange_id: "exchange-1", debate_id: "debate-1", already_answered: true },
      error: null,
    });

    const result = await submitCrossExaminationAnswerV2Action({
      debateId: "debate-1",
      exchangeId: "exchange-1",
      answer: "A retried answer.",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.data.already_answered).toBe(true);
  });

  it("sanitizes a P0001 RPC rejection (e.g. not the target) into its message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Only the targeted debater may answer this question." },
    });

    const result = await submitCrossExaminationAnswerV2Action({
      debateId: "debate-1",
      exchangeId: "exchange-1",
      answer: "An answer.",
    });

    expect(result).toEqual({ ok: false, error: "Only the targeted debater may answer this question." });
  });
});
