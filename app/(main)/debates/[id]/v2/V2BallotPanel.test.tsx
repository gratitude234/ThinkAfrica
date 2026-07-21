import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const castDebateBallotV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  castDebateBallotV2Action: (...args: unknown[]) => castDebateBallotV2ActionMock(...args),
}));

import V2BallotPanel from "./V2BallotPanel";
import { makeArgument, makeBallotResults } from "./testFixtures";

function renderPanel(overrides: Partial<Parameters<typeof V2BallotPanel>[0]> = {}) {
  return render(
    <V2BallotPanel
      debateId="debate-1"
      stage="initial"
      isOpenForSubmission
      ownBallot={null}
      results={null}
      isAuthenticated
      onSuccess={vi.fn()}
      {...overrides}
    />
  );
}

describe("V2BallotPanel", () => {
  beforeEach(() => {
    castDebateBallotV2ActionMock.mockReset();
    castDebateBallotV2ActionMock.mockResolvedValue({
      ok: true,
      data: { ballot_id: "ballot-1", debate_id: "debate-1", stage: "initial", vote: "for", confidence: 3 },
    });
  });

  it("prompts an anonymous visitor to sign in rather than showing the ballot form", () => {
    renderPanel({ isAuthenticated: false });

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByText("Your vote")).not.toBeInTheDocument();
  });

  it("shows the caller's already-cast vote and hides the form once the window has closed", () => {
    renderPanel({
      isOpenForSubmission: false,
      ownBallot: { vote: "against", confidence: 4, reason: null, influentialArgumentId: null, updatedAt: "2026-07-17T00:00:00.000Z" },
    });

    expect(screen.getByText(/You voted/)).toHaveTextContent("against");
    expect(screen.queryByText("Your vote")).not.toBeInTheDocument();
  });

  it("explains that ballots aren't open yet when the window is closed and nothing was cast", () => {
    renderPanel({ isOpenForSubmission: false, stage: "final" });

    expect(screen.getByText(/Final ballots open once the final vote round becomes active\./)).toBeInTheDocument();
  });

  it("requires a confidence level before a ballot can be saved", () => {
    const { container } = renderPanel();

    fireEvent.submit(container.querySelector("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a confidence level (1-5) before saving.");
    expect(castDebateBallotV2ActionMock).not.toHaveBeenCalled();
  });

  it("submits a valid initial ballot with the exact vote/confidence/reason and a null influential argument", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText("Against"));
    await user.selectOptions(screen.getByLabelText("How confident are you?"), "4");
    await user.type(screen.getByLabelText("Why? (optional)"), "Because of the evidence.");
    await user.click(screen.getByRole("button", { name: "Save ballot" }));

    expect(castDebateBallotV2ActionMock).toHaveBeenCalledWith({
      debateId: "debate-1",
      stage: "initial",
      vote: "against",
      confidence: 4,
      reason: "Because of the evidence.",
      influentialArgumentId: null,
    });
  });

  it("only offers the influential-argument selector on a final ballot with eligible arguments", () => {
    const eligibleArguments = [makeArgument({ id: "arg-1", claim: "A strong point" })];

    const { rerender } = renderPanel({ stage: "initial", eligibleArguments });
    expect(screen.queryByText(/Which argument influenced you most/)).not.toBeInTheDocument();

    rerender(
      <V2BallotPanel
        debateId="debate-1"
        stage="final"
        isOpenForSubmission
        ownBallot={null}
        results={null}
        eligibleArguments={eligibleArguments}
        isAuthenticated
        onSuccess={vi.fn()}
      />
    );
    expect(screen.getByText(/Which argument influenced you most/)).toBeInTheDocument();
  });

  it("treats missing aggregate results as a normal 'not available yet' state, not an error", () => {
    renderPanel({ results: null });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Aggregate results appear once/)).toBeInTheDocument();
  });

  it("renders only aggregate for/against/undecided totals -- never a per-voter breakdown", () => {
    renderPanel({ results: makeBallotResults({ forCount: 6, againstCount: 3, undecidedCount: 1, total: 10 }) });

    expect(screen.getByText(/For 60% \(6\)/)).toBeInTheDocument();
    expect(screen.getByText(/Against 30% \(3\)/)).toBeInTheDocument();
    expect(screen.getByText(/Undecided 10% \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/10 ballots/)).toBeInTheDocument();
  });
});
