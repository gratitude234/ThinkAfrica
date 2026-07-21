import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startDebateV2ActionMock = vi.fn();
const advanceDebateRoundV2ActionMock = vi.fn();
const extendDebateRoundV2ActionMock = vi.fn();
const closeDebateV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  startDebateV2Action: (...args: unknown[]) => startDebateV2ActionMock(...args),
  advanceDebateRoundV2Action: (...args: unknown[]) => advanceDebateRoundV2ActionMock(...args),
  extendDebateRoundV2Action: (...args: unknown[]) => extendDebateRoundV2ActionMock(...args),
  closeDebateV2Action: (...args: unknown[]) => closeDebateV2ActionMock(...args),
}));

import V2ModeratorControls from "./V2ModeratorControls";
import { makeDebateSummary, makeRound } from "./testFixtures";

describe("V2ModeratorControls", () => {
  beforeEach(() => {
    startDebateV2ActionMock.mockReset();
    advanceDebateRoundV2ActionMock.mockReset();
    extendDebateRoundV2ActionMock.mockReset();
    closeDebateV2ActionMock.mockReset();
    advanceDebateRoundV2ActionMock.mockResolvedValue({ ok: true, data: { result: "round_advanced" } });
    extendDebateRoundV2ActionMock.mockResolvedValue({ ok: true, data: { result: "extended" } });
    closeDebateV2ActionMock.mockResolvedValue({ ok: true, data: { result: "debate_completed" } });
    startDebateV2ActionMock.mockResolvedValue({ ok: true, data: { already_started: false } });
  });

  it("starts an open debate", async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "open" })}
        activeRound={null}
        nextRound={null}
        onSuccess={onSuccess}
      />
    );

    await user.click(screen.getByRole("button", { name: "Start debate" }));

    expect(startDebateV2ActionMock).toHaveBeenCalledWith("debate-1");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("advances a non-final round using exactly that round's id, not a derived value", async () => {
    const activeRound = makeRound({ id: "round-42", sequenceNumber: 2, phase: "rebuttal", status: "active" });
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "active" })}
        activeRound={activeRound}
        nextRound={makeRound({ id: "round-43", sequenceNumber: 3, phase: "cross_examination" })}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Advance to Cross-Examination/ }));

    expect(advanceDebateRoundV2ActionMock).toHaveBeenCalledWith("debate-1", "round-42");
    expect(closeDebateV2ActionMock).not.toHaveBeenCalled();
  });

  it("collapses advance-and-close into a single contextual 'Close debate' action during final_vote", async () => {
    const activeRound = makeRound({ id: "round-5", sequenceNumber: 5, phase: "final_vote", status: "active" });
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "active" })}
        activeRound={activeRound}
        nextRound={null}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close debate" }));

    expect(closeDebateV2ActionMock).toHaveBeenCalledWith("debate-1", false, null);
    expect(advanceDebateRoundV2ActionMock).not.toHaveBeenCalled();
  });

  it("extends a round passing the round's ends_at through completely unmodified", async () => {
    const activeRound = makeRound({
      id: "round-7",
      sequenceNumber: 1,
      phase: "opening",
      status: "active",
      endsAt: "2026-07-17T12:34:56.789012+00:00",
    });
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "active" })}
        activeRound={activeRound}
        nextRound={makeRound({ id: "round-8", phase: "rebuttal" })}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Extend \d+m/ }));

    expect(extendDebateRoundV2ActionMock).toHaveBeenCalledWith(
      "debate-1",
      "round-7",
      "2026-07-17T12:34:56.789012+00:00",
      10
    );
  });

  it("shows a stale_no_op outcome as a calm status notice, not an error alert", async () => {
    advanceDebateRoundV2ActionMock.mockResolvedValue({ ok: true, data: { result: "stale_no_op" } });
    const activeRound = makeRound({ id: "round-2", sequenceNumber: 1, phase: "opening", status: "active" });
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "active" })}
        activeRound={activeRound}
        nextRound={makeRound({ phase: "rebuttal" })}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Advance to/ }));

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("The debate changed before this action completed. Refreshing…");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires a non-empty reason before force-close can be submitted", async () => {
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "active" })}
        activeRound={makeRound({ status: "active" })}
        nextRound={null}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Force-close this debate early" }));
    const forceCloseButton = screen.getByRole("button", { name: "Force close" });
    expect(forceCloseButton).toBeDisabled();

    await user.type(screen.getByLabelText("Reason for forced closure"), "Abusive content in arguments.");
    expect(forceCloseButton).not.toBeDisabled();

    await user.click(forceCloseButton);
    expect(closeDebateV2ActionMock).toHaveBeenCalledWith("debate-1", true, "Abusive content in arguments.");
  });

  it("disables every other lifecycle control while one action is still in flight", async () => {
    let resolveAdvance: (value: unknown) => void = () => {};
    advanceDebateRoundV2ActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveAdvance = resolve;
      })
    );
    const activeRound = makeRound({ id: "round-1", sequenceNumber: 1, phase: "opening", status: "active" });
    const user = userEvent.setup();
    render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "active" })}
        activeRound={activeRound}
        nextRound={makeRound({ phase: "rebuttal" })}
        onSuccess={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: /Advance to/ }));

    expect(screen.getByRole("button", { name: /Advance to/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Extend \d+m/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Force-close this debate early" })).toBeDisabled();
    expect(advanceDebateRoundV2ActionMock).toHaveBeenCalledTimes(1);

    resolveAdvance({ ok: true, data: { result: "round_advanced" } });
  });

  it("renders nothing once the debate is closed", () => {
    const { container } = render(
      <V2ModeratorControls
        debateId="debate-1"
        debate={makeDebateSummary({ status: "closed" })}
        activeRound={null}
        nextRound={null}
        onSuccess={vi.fn()}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
