import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitDebateArgumentV2ActionMock = vi.fn();

vi.mock("./actions", () => ({
  submitDebateArgumentV2Action: (...args: unknown[]) => submitDebateArgumentV2ActionMock(...args),
}));

import V2ArgumentComposer from "./V2ArgumentComposer";
import { makeArgument } from "./testFixtures";

function renderComposer(overrides: Partial<Parameters<typeof V2ArgumentComposer>[0]> = {}) {
  return render(
    <V2ArgumentComposer
      debateId="debate-1"
      entryType="opening"
      ownStance="for"
      activeRoundSequence={1}
      existingCountForEntryType={0}
      eligibleParents={[]}
      selectedParent={null}
      onClearSelectedParent={vi.fn()}
      onSuccess={vi.fn()}
      {...overrides}
    />
  );
}

describe("V2ArgumentComposer", () => {
  beforeEach(() => {
    submitDebateArgumentV2ActionMock.mockReset();
  });

  it("shows a used-up allowance message instead of the form once the submission limit is reached", () => {
    renderComposer({ entryType: "closing", existingCountForEntryType: 1 });

    expect(screen.getByText(/used your closing submission/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Claim")).not.toBeInTheDocument();
  });

  it("updates the claim character counter and the live word count as the user types", async () => {
    const user = userEvent.setup();
    renderComposer();

    expect(screen.getByText("0 / 240")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Claim"), "A short claim");
    expect(screen.getByText("13 / 240")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Argument"), "one two three");
    expect(screen.getByText("3 / 300 words")).toBeInTheDocument();
  });

  it("flags an over-limit opening statement and disables submission until it's shortened", async () => {
    const user = userEvent.setup();
    renderComposer({ entryType: "opening" });

    const longContent = Array.from({ length: 301 }, (_, i) => `w${i}`).join(" ");
    await user.type(screen.getByLabelText("Claim"), "A claim");
    fireEvent.change(screen.getByLabelText("Argument"), { target: { value: longContent } });

    expect(screen.getByText("Shorten your argument to 300 words or fewer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("requires a target and a relation before a rebuttal can be submitted", () => {
    renderComposer({
      entryType: "rebuttal",
      activeRoundSequence: 2,
      eligibleParents: [makeArgument({ id: "parent-1", stance: "against", roundSequence: 1 })],
    });

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("flags a rebuttal that targets a round that isn't earlier than the active one", async () => {
    const user = userEvent.setup();
    renderComposer({
      entryType: "rebuttal",
      activeRoundSequence: 2,
      eligibleParents: [makeArgument({ id: "parent-1", stance: "against", roundSequence: 2 })],
    });

    await user.selectOptions(screen.getByLabelText("Responding to"), "parent-1");
    await user.selectOptions(screen.getByLabelText("How does your rebuttal relate?"), "supports");

    expect(screen.getByText("A rebuttal must target an argument from an earlier round.")).toBeInTheDocument();
  });

  it("flags a direct challenge that targets the same stance instead of the opposing one", async () => {
    const user = userEvent.setup();
    renderComposer({
      entryType: "rebuttal",
      ownStance: "for",
      activeRoundSequence: 2,
      eligibleParents: [makeArgument({ id: "parent-1", stance: "for", roundSequence: 1 })],
    });

    await user.selectOptions(screen.getByLabelText("Responding to"), "parent-1");
    await user.selectOptions(screen.getByLabelText("How does your rebuttal relate?"), "challenges");

    expect(screen.getByText("A direct challenge must target the opposing stance.")).toBeInTheDocument();
  });

  it("disables submission for an invalid rebuttal target/relation combination, not just the inline warning", async () => {
    const user = userEvent.setup();
    renderComposer({
      entryType: "rebuttal",
      ownStance: "for",
      activeRoundSequence: 2,
      eligibleParents: [makeArgument({ id: "parent-1", stance: "for", roundSequence: 1 })],
    });

    await user.type(screen.getByLabelText("Claim"), "My rebuttal claim");
    await user.type(screen.getByLabelText("Argument"), "My rebuttal content.");
    await user.selectOptions(screen.getByLabelText("Responding to"), "parent-1");
    await user.selectOptions(screen.getByLabelText("How does your rebuttal relate?"), "challenges");

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("never calls the server action for an invalid rebuttal, even if submission is forced past the disabled button", async () => {
    const { container } = renderComposer({
      entryType: "rebuttal",
      ownStance: "for",
      activeRoundSequence: 2,
      eligibleParents: [makeArgument({ id: "parent-1", stance: "for", roundSequence: 1 })],
    });

    fireEvent.change(screen.getByLabelText("Claim"), { target: { value: "My rebuttal claim" } });
    fireEvent.change(screen.getByLabelText("Argument"), { target: { value: "My rebuttal content." } });
    fireEvent.change(screen.getByLabelText("Responding to"), { target: { value: "parent-1" } });
    fireEvent.change(screen.getByLabelText("How does your rebuttal relate?"), { target: { value: "challenges" } });
    fireEvent.submit(container.querySelector("form")!);

    expect(submitDebateArgumentV2ActionMock).not.toHaveBeenCalled();
    expect(screen.getByText("Fix the rebuttal target above before submitting.")).toBeInTheDocument();
  });

  it("preserves entered content after a recoverable submission error instead of clearing the form", async () => {
    submitDebateArgumentV2ActionMock.mockResolvedValue({ ok: false, error: "The round changed before this saved." });
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText("Claim"), "My claim");
    await user.type(screen.getByLabelText("Argument"), "My argument content.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The round changed before this saved.");
    expect(screen.getByLabelText("Claim")).toHaveValue("My claim");
    expect(screen.getByLabelText("Argument")).toHaveValue("My argument content.");
  });

  it("disables the submit button while a submission is in flight, preventing a double-submit", async () => {
    let resolveSubmit: (value: unknown) => void = () => {};
    submitDebateArgumentV2ActionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      })
    );
    const user = userEvent.setup();
    renderComposer();

    await user.type(screen.getByLabelText("Claim"), "My claim");
    await user.type(screen.getByLabelText("Argument"), "My argument content.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
    expect(submitDebateArgumentV2ActionMock).toHaveBeenCalledTimes(1);

    resolveSubmit({ ok: true, data: {} });
  });

  it("clears the form and reports success once the argument is accepted", async () => {
    submitDebateArgumentV2ActionMock.mockResolvedValue({ ok: true, data: {} });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderComposer({ onSuccess });

    await user.type(screen.getByLabelText("Claim"), "My claim");
    await user.type(screen.getByLabelText("Argument"), "My argument content.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Argument submitted.");
    expect(screen.getByLabelText("Claim")).toHaveValue("");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
