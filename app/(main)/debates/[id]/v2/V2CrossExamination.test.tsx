import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitCrossExaminationQuestionV2ActionMock = vi.fn();
const submitCrossExaminationAnswerV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  submitCrossExaminationQuestionV2Action: (...args: unknown[]) => submitCrossExaminationQuestionV2ActionMock(...args),
  submitCrossExaminationAnswerV2Action: (...args: unknown[]) => submitCrossExaminationAnswerV2ActionMock(...args),
}));

import V2CrossExamination from "./V2CrossExamination";
import { makeArgument, makeCrossExchange, makeProfile, makeRound } from "./testFixtures";
import type { DebateV2DebaterSummary } from "./types";

const liveRound = makeRound({ id: "round-3", sequenceNumber: 3, phase: "cross_examination", status: "active" });

const forDebater: DebateV2DebaterSummary = {
  userId: "viewer-1",
  profile: makeProfile({ id: "viewer-1", full_name: "Viewer One" }),
  stance: "for",
};
const opposingDebaterA: DebateV2DebaterSummary = {
  userId: "against-1",
  profile: makeProfile({ id: "against-1", full_name: "Against One" }),
  stance: "against",
};
const opposingDebaterB: DebateV2DebaterSummary = {
  userId: "against-2",
  profile: makeProfile({ id: "against-2", full_name: "Against Two" }),
  stance: "against",
};

function renderComponent(overrides: Partial<Parameters<typeof V2CrossExamination>[0]> = {}) {
  return render(
    <V2CrossExamination
      debateId="debate-1"
      exchanges={[]}
      debaters={[forDebater, opposingDebaterA, opposingDebaterB]}
      arguments={[]}
      activeRound={liveRound}
      debateStatus="active"
      currentUserId="viewer-1"
      isAuthenticated
      ownStance="for"
      onSuccess={vi.fn()}
      {...overrides}
    />
  );
}

describe("V2CrossExamination", () => {
  beforeEach(() => {
    submitCrossExaminationQuestionV2ActionMock.mockReset();
    submitCrossExaminationAnswerV2ActionMock.mockReset();
  });

  it("shows a sign-in prompt for an anonymous viewer during a live round, with no ask form", () => {
    renderComponent({ isAuthenticated: false, currentUserId: null, ownStance: null });

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask")).not.toBeInTheDocument();
  });

  it("shows a read-only explanation for an authenticated non-debater (juror)", () => {
    renderComponent({ ownStance: null });

    expect(screen.getByText(/Only joined debaters can ask or answer/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask")).not.toBeInTheDocument();
  });

  it("offers only opposing-stance debaters in the target selector, never the viewer's own side", async () => {
    renderComponent();

    const select = screen.getByLabelText("Ask") as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);

    expect(optionLabels).toContain("Against One");
    expect(optionLabels).toContain("Against Two");
    expect(optionLabels).not.toContain("Viewer One");
  });

  it("filters the optional target-argument selector to the selected target's earlier-round arguments only", async () => {
    const user = userEvent.setup();
    const eligible = makeArgument({ id: "arg-eligible", authorId: "against-1", roundSequence: 1, claim: "Eligible claim" });
    const wrongAuthor = makeArgument({ id: "arg-wrong-author", authorId: "against-2", roundSequence: 1, claim: "Wrong author claim" });
    const tooLate = makeArgument({ id: "arg-too-late", authorId: "against-1", roundSequence: 3, claim: "Too late claim" });

    renderComponent({ arguments: [eligible, wrongAuthor, tooLate] });

    await user.selectOptions(screen.getByLabelText("Ask"), "against-1");

    const argSelect = screen.getByLabelText("About which argument? (optional)") as HTMLSelectElement;
    const optionLabels = Array.from(argSelect.options).map((o) => o.textContent);

    expect(optionLabels.some((label) => label?.includes("Eligible claim"))).toBe(true);
    expect(optionLabels.some((label) => label?.includes("Wrong author claim"))).toBe(false);
    expect(optionLabels.some((label) => label?.includes("Too late claim"))).toBe(false);
  });

  it("shows a live 60-word counter and flags an over-limit question", async () => {
    renderComponent();

    expect(screen.getByText("0 / 60 words")).toBeInTheDocument();

    const overLimit = Array.from({ length: 61 }, (_, i) => `w${i}`).join(" ");
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: overLimit } });

    expect(screen.getByText("Shorten your question to 60 words or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask question" })).toBeDisabled();
  });

  it("shows a clear remaining-allowance count and a read-only message once the 2-question allowance is exhausted", () => {
    const { rerender } = renderComponent({
      exchanges: [makeCrossExchange({ id: "e1", askerId: "viewer-1" })],
    });
    expect(screen.getByText("1 of 2 questions remaining")).toBeInTheDocument();

    rerender(
      <V2CrossExamination
        debateId="debate-1"
        exchanges={[
          makeCrossExchange({ id: "e1", askerId: "viewer-1" }),
          makeCrossExchange({ id: "e2", askerId: "viewer-1" }),
        ]}
        debaters={[forDebater, opposingDebaterA, opposingDebaterB]}
        arguments={[]}
        activeRound={liveRound}
        debateStatus="active"
        currentUserId="viewer-1"
        isAuthenticated
        ownStance="for"
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText(/asked the maximum of 2 cross-examination questions/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask")).not.toBeInTheDocument();
  });

  it("submits a question with the exact target/question/optional-argument payload", async () => {
    submitCrossExaminationQuestionV2ActionMock.mockResolvedValue({ ok: true, data: { exchange_id: "e1" } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    const eligibleArg = makeArgument({ id: "arg-1", authorId: "against-1", roundSequence: 1 });
    renderComponent({ arguments: [eligibleArg], onSuccess });

    await user.selectOptions(screen.getByLabelText("Ask"), "against-1");
    await user.selectOptions(screen.getByLabelText("About which argument? (optional)"), "arg-1");
    await user.type(screen.getByLabelText("Question"), "Why do you believe that?");
    await user.click(screen.getByRole("button", { name: "Ask question" }));

    expect(submitCrossExaminationQuestionV2ActionMock).toHaveBeenCalledWith({
      debateId: "debate-1",
      targetUserId: "against-1",
      question: "Why do you believe that?",
      targetArgumentId: "arg-1",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("preserves the question draft after a recoverable submission error instead of clearing the form", async () => {
    submitCrossExaminationQuestionV2ActionMock.mockResolvedValue({ ok: false, error: "The target must have the opposing stance." });
    const user = userEvent.setup();
    renderComponent();

    await user.selectOptions(screen.getByLabelText("Ask"), "against-1");
    await user.type(screen.getByLabelText("Question"), "Why do you believe that?");
    await user.click(screen.getByRole("button", { name: "Ask question" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The target must have the opposing stance.");
    expect(screen.getByLabelText("Question")).toHaveValue("Why do you believe that?");
    expect(screen.getByLabelText("Ask")).toHaveValue("against-1");
  });

  it("disables the ask button while a question submission is in flight, preventing a double submit", async () => {
    let resolveSubmit: (value: unknown) => void = () => {};
    submitCrossExaminationQuestionV2ActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );
    const user = userEvent.setup();
    renderComponent();

    await user.selectOptions(screen.getByLabelText("Ask"), "against-1");
    await user.type(screen.getByLabelText("Question"), "Why do you believe that?");
    await user.click(screen.getByRole("button", { name: "Ask question" }));

    expect(screen.getByRole("button", { name: "Ask question" })).toBeDisabled();
    expect(submitCrossExaminationQuestionV2ActionMock).toHaveBeenCalledTimes(1);

    resolveSubmit({ ok: true, data: {} });
  });

  it("shows an inline answer form, with its own 120-word counter, for the targeted debater's unanswered question", () => {
    const exchange = makeCrossExchange({ id: "e1", askerId: "against-1", targetId: "viewer-1", roundId: "round-3" });
    renderComponent({ exchanges: [exchange], currentUserId: "viewer-1" });

    expect(screen.getByText("Awaiting answer")).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
    expect(screen.getByText("0 / 120 words")).toBeInTheDocument();
  });

  it("flags an over-limit answer and disables submission", () => {
    const exchange = makeCrossExchange({ id: "e1", askerId: "against-1", targetId: "viewer-1", roundId: "round-3" });
    renderComponent({ exchanges: [exchange], currentUserId: "viewer-1" });

    const overLimit = Array.from({ length: 121 }, (_, i) => `w${i}`).join(" ");
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: overLimit } });

    expect(screen.getByText("Shorten your answer to 120 words or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit answer" })).toBeDisabled();
  });

  it("submits an answer and calls onSuccess", async () => {
    submitCrossExaminationAnswerV2ActionMock.mockResolvedValue({ ok: true, data: { exchange_id: "e1", already_answered: false } });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    const exchange = makeCrossExchange({ id: "e1", askerId: "against-1", targetId: "viewer-1", roundId: "round-3" });
    renderComponent({ exchanges: [exchange], currentUserId: "viewer-1", onSuccess });

    await user.type(screen.getByLabelText("Your answer"), "Because the evidence supports it.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(submitCrossExaminationAnswerV2ActionMock).toHaveBeenCalledWith({
      debateId: "debate-1",
      exchangeId: "e1",
      answer: "Because the evidence supports it.",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("preserves the answer draft after a recoverable submission error", async () => {
    submitCrossExaminationAnswerV2ActionMock.mockResolvedValue({ ok: false, error: "Only the targeted debater may answer this question." });
    const user = userEvent.setup();
    const exchange = makeCrossExchange({ id: "e1", askerId: "against-1", targetId: "viewer-1", roundId: "round-3" });
    renderComponent({ exchanges: [exchange], currentUserId: "viewer-1" });

    await user.type(screen.getByLabelText("Your answer"), "My answer text.");
    await user.click(screen.getByRole("button", { name: "Submit answer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Only the targeted debater may answer this question.");
    expect(screen.getByLabelText("Your answer")).toHaveValue("My answer text.");
  });

  it("does not show an answer form to anyone other than the targeted debater", () => {
    const exchange = makeCrossExchange({ id: "e1", askerId: "against-1", targetId: "target-other", roundId: "round-3" });
    renderComponent({ exchanges: [exchange], currentUserId: "viewer-1" });

    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for/)).toBeInTheDocument();
  });

  it("clearly pairs an answered question with its answer, showing both asker and respondent", () => {
    const exchange = makeCrossExchange({
      id: "e1",
      askerId: "against-1",
      asker: makeProfile({ id: "against-1", full_name: "Against One" }),
      targetId: "viewer-1",
      target: makeProfile({ id: "viewer-1", full_name: "Viewer One" }),
      roundId: "round-3",
      question: "Why do you believe that?",
      answer: "Because the evidence supports it.",
      answeredAt: "2026-07-17T00:15:00.000Z",
    });
    // debaters: [] so the ask-form's target dropdown (which would otherwise
    // also offer "Against One" as an option) can't collide with the
    // exchange item's own asker/target name text below.
    renderComponent({ exchanges: [exchange], debaters: [] });

    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.getByText("Why do you believe that?")).toBeInTheDocument();
    expect(screen.getByText("Because the evidence supports it.")).toBeInTheDocument();
    // "Against One" appears once, as the asker; "Viewer One" appears twice
    // -- once as the respondent in the "asked" line, once again heading its
    // own answer -- both are exactly the "asker and respondent shown" pairing.
    expect(screen.getAllByText(/Against One/)).toHaveLength(1);
    expect(screen.getAllByText(/Viewer One/).length).toBeGreaterThanOrEqual(2);
  });

  it("shows a referenced argument when the question targeted one", () => {
    const exchange = makeCrossExchange({
      id: "e1",
      roundId: "round-3",
      targetArgumentId: "arg-1",
      targetArgument: { id: "arg-1", claim: "The original claim", authorName: "Against One", stance: "against" },
    });
    renderComponent({ exchanges: [exchange] });

    expect(screen.getByText(/Referencing Against One's claim/)).toBeInTheDocument();
    expect(screen.getByText(/The original claim/)).toBeInTheDocument();
  });

  it("labels an unanswered question from a round that is no longer active as Unanswered, with no answer form", () => {
    const expiredRound = makeRound({ id: "round-4", sequenceNumber: 4, phase: "closing", status: "active" });
    const exchange = makeCrossExchange({ id: "e1", targetId: "viewer-1", roundId: "round-3" });
    renderComponent({ exchanges: [exchange], currentUserId: "viewer-1", activeRound: expiredRound });

    expect(screen.getByText("Unanswered")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your answer")).not.toBeInTheDocument();
  });

  it("still shows historical exchanges after the round has ended, without any ask form", () => {
    const closedRound = makeRound({ id: "round-5", sequenceNumber: 5, phase: "final_vote", status: "active" });
    const exchange = makeCrossExchange({ id: "e1", roundId: "round-3", answer: "An answer.", answeredAt: "2026-07-17T00:15:00.000Z" });
    renderComponent({ exchanges: [exchange], activeRound: closedRound });

    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask")).not.toBeInTheDocument();
  });

  it("shows a No questions yet message when there are none", () => {
    renderComponent();
    expect(screen.getByText("No questions have been asked yet.")).toBeInTheDocument();
  });
});
