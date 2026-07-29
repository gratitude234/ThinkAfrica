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
      currentUserId="user-1"
      {...overrides}
    />
  );
}

describe("V2ArgumentComposer", () => {
  beforeEach(() => {
    submitDebateArgumentV2ActionMock.mockReset();
    window.localStorage.clear();
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

// The room polls every 15s and re-renders from fresh server state, so an
// advancing round can change entryType/activeRoundSequence under someone who
// is mid-sentence. These cover what happens to their unsent words.
describe("V2ArgumentComposer draft safety", () => {
  beforeEach(() => {
    submitDebateArgumentV2ActionMock.mockReset();
    window.localStorage.clear();
  });

  it("keeps a draft across an unmount instead of losing it with the component", async () => {
    const user = userEvent.setup();
    const { unmount } = renderComposer();

    await user.type(screen.getByLabelText("Claim"), "Half-written claim");
    await user.type(screen.getByLabelText("Argument"), "Ten minutes of work.");

    // The debounced write is what has to survive, so let it land.
    await vi.waitFor(() =>
      expect(window.localStorage.getItem("v2-draft:debate-1:opening:1:user-1")).not.toBeNull()
    );

    unmount();
    renderComposer();

    expect(await screen.findByLabelText("Claim")).toHaveValue("Half-written claim");
    expect(screen.getByLabelText("Argument")).toHaveValue("Ten minutes of work.");
    expect(screen.getByRole("status")).toHaveTextContent("Restored the draft");
  });

  it("locks the composer and preserves the text when the round advances mid-write", async () => {
    const user = userEvent.setup();
    const { rerender } = renderComposer();

    await user.type(screen.getByLabelText("Claim"), "My opening claim");
    await user.type(screen.getByLabelText("Argument"), "My opening argument.");

    rerender(
      <V2ArgumentComposer
        debateId="debate-1"
        entryType="rebuttal"
        ownStance="for"
        activeRoundSequence={2}
        existingCountForEntryType={0}
        eligibleParents={[]}
        selectedParent={null}
        onClearSelectedParent={vi.fn()}
        onSuccess={vi.fn()}
        currentUserId="user-1"
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The debate moved on while you were writing.");
    // The words themselves must still be on screen, not merely "kept safe".
    expect(screen.getByLabelText("Your unsent opening statement")).toHaveValue(
      "My opening argument."
    );
    // And there must be no way to post opening text into the rebuttal round.
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("returns a clean composer for the new round once the stranded draft is discarded", async () => {
    const user = userEvent.setup();
    const { rerender } = renderComposer();

    await user.type(screen.getByLabelText("Claim"), "My opening claim");
    await user.type(screen.getByLabelText("Argument"), "My opening argument.");

    rerender(
      <V2ArgumentComposer
        debateId="debate-1"
        entryType="rebuttal"
        ownStance="for"
        activeRoundSequence={2}
        existingCountForEntryType={0}
        eligibleParents={[]}
        selectedParent={null}
        onClearSelectedParent={vi.fn()}
        onSuccess={vi.fn()}
        currentUserId="user-1"
      />
    );

    await user.click(screen.getByRole("button", { name: "Discard and write my rebuttal" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Claim")).toHaveValue("");
    expect(screen.getByLabelText("Argument")).toHaveValue("");
  });

  it("does not resurrect a submitted argument as a phantom draft", async () => {
    submitDebateArgumentV2ActionMock.mockResolvedValue({ ok: true, data: {} });
    const user = userEvent.setup();
    const { unmount } = renderComposer();

    await user.type(screen.getByLabelText("Claim"), "My claim");
    await user.type(screen.getByLabelText("Argument"), "My argument content.");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await screen.findByRole("status");

    unmount();
    renderComposer();

    expect(screen.getByLabelText("Claim")).toHaveValue("");
    expect(screen.getByLabelText("Argument")).toHaveValue("");
  });
});
