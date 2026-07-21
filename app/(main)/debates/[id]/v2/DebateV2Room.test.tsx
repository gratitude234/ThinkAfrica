import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadDebateV2RoomMock = vi.fn();
const loadDebateV2RoomSignalMock = vi.fn();
const joinDebateV2ActionMock = vi.fn();
const castDebateBallotV2ActionMock = vi.fn();
const submitDebateArgumentV2ActionMock = vi.fn();
const toggleDebateReactionV2ActionMock = vi.fn();
const startDebateV2ActionMock = vi.fn();
const advanceDebateRoundV2ActionMock = vi.fn();
const extendDebateRoundV2ActionMock = vi.fn();
const closeDebateV2ActionMock = vi.fn();
const submitCrossExaminationQuestionV2ActionMock = vi.fn();
const submitCrossExaminationAnswerV2ActionMock = vi.fn();
const setDebateSubscriptionV2ActionMock = vi.fn();

vi.mock("./loadRoomData", () => ({
  loadDebateV2Room: (...args: unknown[]) => loadDebateV2RoomMock(...args),
}));

vi.mock("./loadRoomSignal", () => ({
  loadDebateV2RoomSignal: (...args: unknown[]) => loadDebateV2RoomSignalMock(...args),
}));

vi.mock("./actions", () => ({
  joinDebateV2Action: (...args: unknown[]) => joinDebateV2ActionMock(...args),
  castDebateBallotV2Action: (...args: unknown[]) => castDebateBallotV2ActionMock(...args),
  submitDebateArgumentV2Action: (...args: unknown[]) => submitDebateArgumentV2ActionMock(...args),
  toggleDebateReactionV2Action: (...args: unknown[]) => toggleDebateReactionV2ActionMock(...args),
  startDebateV2Action: (...args: unknown[]) => startDebateV2ActionMock(...args),
  advanceDebateRoundV2Action: (...args: unknown[]) => advanceDebateRoundV2ActionMock(...args),
  extendDebateRoundV2Action: (...args: unknown[]) => extendDebateRoundV2ActionMock(...args),
  closeDebateV2Action: (...args: unknown[]) => closeDebateV2ActionMock(...args),
  submitCrossExaminationQuestionV2Action: (...args: unknown[]) => submitCrossExaminationQuestionV2ActionMock(...args),
  submitCrossExaminationAnswerV2Action: (...args: unknown[]) => submitCrossExaminationAnswerV2ActionMock(...args),
  setDebateSubscriptionV2Action: (...args: unknown[]) => setDebateSubscriptionV2ActionMock(...args),
}));

import DebateV2Room from "./DebateV2Room";
import { makeArgument, makeBallotResults, makeDebateSummary, makeRoom, makeRound } from "./testFixtures";

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
}

describe("DebateV2Room", () => {
  beforeEach(() => {
    loadDebateV2RoomMock.mockReset();
    setDebateSubscriptionV2ActionMock.mockReset();
    setDocumentHidden(false);
  });

  afterEach(() => {
    setDocumentHidden(false);
    vi.useRealTimers();
  });

  it("shows the lobby and the initial ballot panel while the debate is open", () => {
    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "open" }) })} />);

    expect(screen.getByText("Join the room")).toBeInTheDocument();
    expect(screen.getByText("Cast your initial ballot")).toBeInTheDocument();
  });

  it("shows the argument composer for a joined debater during a submission round", () => {
    const activeRound = makeRound({ id: "round-1", sequenceNumber: 1, phase: "opening", status: "active" });
    const room = makeRoom({
      debate: makeDebateSummary({ status: "active" }),
      rounds: [activeRound],
      activeRound,
      currentUser: {
        id: "viewer-1",
        isAuthenticated: true,
        canManage: false,
        membership: { debaterStance: "for", isJuror: false, isModeratorMember: false },
        ballots: { initial: null, final: null },
        subscription: null,
      },
    });

    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    expect(screen.getByText(/Write your opening statement/)).toBeInTheDocument();
  });

  it("explains that only joined debaters can submit, instead of showing the composer, for a non-debater", () => {
    const activeRound = makeRound({ id: "round-1", sequenceNumber: 1, phase: "opening", status: "active" });
    const room = makeRoom({
      debate: makeDebateSummary({ status: "active" }),
      rounds: [activeRound],
      activeRound,
    });

    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    expect(screen.queryByText(/Write your opening statement/)).not.toBeInTheDocument();
    expect(screen.getByText(/Only joined debaters can submit arguments/)).toBeInTheDocument();
  });

  it("shows a read-only explanation during cross-examination, with no composer and no ballot panel", () => {
    const activeRound = makeRound({ id: "round-3", sequenceNumber: 3, phase: "cross_examination", status: "active" });
    const room = makeRoom({
      debate: makeDebateSummary({ status: "active" }),
      rounds: [activeRound],
      activeRound,
      currentUser: {
        id: "viewer-1",
        isAuthenticated: true,
        canManage: false,
        membership: { debaterStance: "for", isJuror: false, isModeratorMember: false },
        ballots: { initial: null, final: null },
        subscription: null,
      },
    });

    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    expect(screen.getByText("Cross-examination")).toBeInTheDocument();
    expect(screen.queryByText("Cast your final ballot")).not.toBeInTheDocument();
  });

  it("shows the final ballot panel instead of the composer during final_vote", () => {
    const activeRound = makeRound({ id: "round-5", sequenceNumber: 5, phase: "final_vote", status: "active" });
    const room = makeRoom({
      debate: makeDebateSummary({ status: "active" }),
      rounds: [activeRound],
      activeRound,
    });

    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    expect(screen.getByText("Cast your final ballot")).toBeInTheDocument();
  });

  it("shows moderator controls to a caller who can manage the debate", () => {
    const room = makeRoom({
      currentUser: {
        id: "mod-1",
        isAuthenticated: true,
        canManage: true,
        membership: { debaterStance: null, isJuror: false, isModeratorMember: true },
        ballots: { initial: null, final: null },
        subscription: null,
      },
    });
    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);
    expect(screen.getByText("Moderator controls")).toBeInTheDocument();
  });

  it("hides moderator controls from a caller who cannot manage the debate", () => {
    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom()} />);
    expect(screen.queryByText("Moderator controls")).not.toBeInTheDocument();
  });

  it("does not reload the room when the caller only follows the debate -- a subscription update never triggers loadDebateV2Room", async () => {
    setDebateSubscriptionV2ActionMock.mockResolvedValue({
      ok: true,
      data: {
        debate_id: "debate-1",
        is_subscribed: true,
        notify_phase_changes: true,
        notify_direct_responses: true,
        notify_evidence_requests: true,
        notify_final_vote: true,
        notify_recap: true,
      },
    });
    const user = userEvent.setup();
    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom()} />);

    await user.click(screen.getByRole("button", { name: "Follow this debate" }));

    expect(setDebateSubscriptionV2ActionMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Unfollow this debate" })).toBeInTheDocument();
    expect(loadDebateV2RoomMock).not.toHaveBeenCalled();
  });

  it("summarizes a closed debate factually without declaring a winner", () => {
    const room = makeRoom({
      debate: makeDebateSummary({ status: "closed", closureKind: "completed" }),
      ballotResults: {
        initial: makeBallotResults({ forCount: 4, againstCount: 4, undecidedCount: 2, total: 10 }),
        final: makeBallotResults({ forCount: 7, againstCount: 2, undecidedCount: 1, total: 10 }),
      },
    });

    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    expect(screen.getByText("Debate completed")).toBeInTheDocument();
    expect(screen.getByText(/Opinion movement/)).toBeInTheDocument();
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/\bwinner\b|\bwins\b/);
  });

  it("labels a force-closed debate distinctly from a normally completed one", () => {
    const room = makeRoom({ debate: makeDebateSummary({ status: "closed", closureKind: "forced" }) });
    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    expect(screen.getByText("Debate force-closed")).toBeInTheDocument();
  });

  it("lets a debater start a rebuttal from an argument card, pre-selecting that argument as the parent", async () => {
    const openingRound = makeRound({ id: "round-1", sequenceNumber: 1, phase: "opening", status: "completed" });
    const rebuttalRound = makeRound({ id: "round-2", sequenceNumber: 2, phase: "rebuttal", status: "active" });
    const opposingArgument = makeArgument({
      id: "arg-opp",
      authorId: "author-2",
      stance: "against",
      roundId: "round-1",
      roundSequence: 1,
      claim: "The opposing opening claim",
    });
    const room = makeRoom({
      debate: makeDebateSummary({ status: "active" }),
      rounds: [openingRound, rebuttalRound],
      activeRound: rebuttalRound,
      arguments: [opposingArgument],
      currentUser: {
        id: "viewer-1",
        isAuthenticated: true,
        canManage: false,
        membership: { debaterStance: "for", isJuror: false, isModeratorMember: false },
        ballots: { initial: null, final: null },
        subscription: null,
      },
    });
    const user = userEvent.setup();

    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    await user.click(screen.getByRole("button", { name: "Rebut this" }));

    expect(screen.getByLabelText("Responding to")).toHaveValue("arg-opp");
  });

  const baseSignal = {
    debateStatus: "active" as const,
    closureKind: null,
    rounds: [{ id: "round-1", status: "active" as const, endsAt: "2026-07-17T00:30:00.000Z" }],
    argumentCount: 2,
    reactionCount: 1,
    reactionLatestCreatedAt: "2026-07-17T00:00:00.000Z",
    crossExchangeCount: 0,
    crossExchangeLatestUpdatedAt: null,
    membershipCount: 3,
    canManage: false,
    initialBallotCount: 1,
    initialBallotLatestUpdatedAt: "2026-07-17T00:00:00.000Z",
    finalBallotCount: null,
    finalBallotLatestUpdatedAt: null,
  };

  beforeEach(() => {
    loadDebateV2RoomSignalMock.mockReset();
  });

  it("always performs one full reload on the first poll tick, so a change between the SSR render and now is never permanently missed", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock.mockResolvedValue(baseSignal);
    loadDebateV2RoomMock.mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) }));

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    expect(loadDebateV2RoomSignalMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(loadDebateV2RoomSignalMock).toHaveBeenCalledTimes(1);
    // There is no earlier signal to diff the first tick against -- it
    // always reloads once rather than silently adopting whatever the first
    // signal shows as a false "nothing changed" baseline (the bug: another
    // user's argument submitted seconds after page load, before this tick,
    // would otherwise never appear until some unrelated later change).
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);
  });

  it("skips the reload on a later tick once the signal is unchanged from the previous tick's baseline", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock.mockResolvedValue(baseSignal);
    loadDebateV2RoomMock.mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) }));

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 1: always reloads
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 2: identical signal -- no new reload
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);
  });

  it("reloads again once a later tick's signal actually changes", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock
      .mockResolvedValueOnce(baseSignal) // tick 1 (always reloads, establishes baseline)
      .mockResolvedValueOnce(baseSignal) // tick 2: unchanged
      .mockResolvedValue({ ...baseSignal, argumentCount: 3 }); // tick 3: changed
    loadDebateV2RoomMock.mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) }));

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(2);
  });

  it("a new cross-examination question (count change) triggers a full refresh", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock
      .mockResolvedValueOnce(baseSignal) // tick 1: establishes baseline
      .mockResolvedValue({ ...baseSignal, crossExchangeCount: 1 }); // tick 2: a new question
    loadDebateV2RoomMock.mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) }));

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 1
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 2: question count changed
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(2);
  });

  it("a newly submitted answer (updated_at change, no count change) triggers a full refresh", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock
      .mockResolvedValueOnce({ ...baseSignal, crossExchangeCount: 1, crossExchangeLatestUpdatedAt: "2026-07-17T00:10:00.000Z" }) // tick 1: baseline, one question already asked
      .mockResolvedValue({ ...baseSignal, crossExchangeCount: 1, crossExchangeLatestUpdatedAt: "2026-07-17T00:20:00.000Z" }); // tick 2: same question answered -- count unchanged, updated_at moved
    loadDebateV2RoomMock.mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) }));

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 1
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 2: answer submitted, count still 1
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(2);
  });

  it("treats a null result from a triggered reload as a failure, not a silent success", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock.mockResolvedValue(baseSignal);
    loadDebateV2RoomMock
      .mockResolvedValueOnce(null) // tick 1's reload "succeeds" but returns no data
      .mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) })); // tick 2 succeeds properly

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 1: reload returns null -- treated as a failure
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Could not refresh just now/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 2: retries, since the baseline was never committed
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Could not refresh just now/)).not.toBeInTheDocument();
  });

  it("retries a failed full reload on the next tick instead of silently treating it as caught up", async () => {
    vi.useFakeTimers();
    loadDebateV2RoomSignalMock.mockResolvedValue(baseSignal);
    loadDebateV2RoomMock
      .mockRejectedValueOnce(new Error("network blip")) // tick 1's reload fails
      .mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) })); // tick 2's reload succeeds

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    // Tick 1: first tick always reloads -- this attempt fails.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Could not refresh just now/)).toBeInTheDocument();

    // Tick 2: the signal is identical to tick 1's -- but the failed reload
    // was never applied, so the baseline was never committed, and this must
    // retry rather than concluding "nothing changed since last time".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Could not refresh just now/)).not.toBeInTheDocument();
  });

  it("also retries when a real change's reload fails, even once an earlier, unrelated baseline had already been committed", async () => {
    vi.useFakeTimers();
    const changedSignal = { ...baseSignal, argumentCount: 3 };
    loadDebateV2RoomSignalMock
      .mockResolvedValueOnce(baseSignal) // tick 1: establishes a committed baseline
      .mockResolvedValue(changedSignal); // tick 2+: a real change, held steady
    loadDebateV2RoomMock
      .mockResolvedValueOnce(makeRoom({ debate: makeDebateSummary({ status: "active" }) })) // tick 1 succeeds
      .mockRejectedValueOnce(new Error("network blip")) // tick 2 fails
      .mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "active" }) })); // tick 3 succeeds

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 1: baseline committed
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 2: change detected, reload fails
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Could not refresh just now/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000); // tick 3: identical signal to tick 2 -- must still retry
    });
    expect(loadDebateV2RoomMock).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/Could not refresh just now/)).not.toBeInTheDocument();
  });

  it("does not poll while the tab is hidden", async () => {
    vi.useFakeTimers();
    setDocumentHidden(true);
    loadDebateV2RoomSignalMock.mockResolvedValue(baseSignal);

    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "active" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(loadDebateV2RoomSignalMock).not.toHaveBeenCalled();
  });

  it("never arms polling at all for an already-closed debate", async () => {
    vi.useFakeTimers();
    render(<DebateV2Room debateId="debate-1" initialRoom={makeRoom({ debate: makeDebateSummary({ status: "closed" }) })} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(loadDebateV2RoomSignalMock).not.toHaveBeenCalled();
    expect(loadDebateV2RoomMock).not.toHaveBeenCalled();
  });

  it("clears a stale refresh-error notice once a background poll succeeds again", async () => {
    vi.useFakeTimers();
    startDebateV2ActionMock.mockResolvedValue({ ok: true, data: { already_started: false } });
    loadDebateV2RoomMock
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValue(makeRoom({ debate: makeDebateSummary({ status: "open" }) }));
    loadDebateV2RoomSignalMock.mockResolvedValue(baseSignal);

    const room = makeRoom({
      debate: makeDebateSummary({ status: "open" }),
      currentUser: {
        id: "mod-1",
        isAuthenticated: true,
        canManage: true,
        membership: { debaterStance: null, isJuror: false, isModeratorMember: true },
        ballots: { initial: null, final: null },
        subscription: null,
      },
    });
    render(<DebateV2Room debateId="debate-1" initialRoom={room} />);

    // A failed mutation-triggered refresh() shows the "will retry
    // automatically" notice -- fireEvent (not userEvent) here since
    // userEvent's internal delay scheduling doesn't mix with fake timers.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start debate" }));
    });
    expect(screen.getByText(/Could not refresh just now/)).toBeInTheDocument();

    // ... and the promise is kept: the next successful background poll
    // clears it, even though nothing in the room actually changed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(screen.queryByText(/Could not refresh just now/)).not.toBeInTheDocument();
  });
});
