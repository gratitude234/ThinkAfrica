import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WriteHeader, { writeStatus, type WriteStatus } from "./WriteHeader";

function renderHeader(status: WriteStatus | null, onBack = vi.fn()) {
  render(
    <WriteHeader
      status={status}
      onBack={onBack}
      hasAppNav
      heading="New post"
      menu={<button type="button">More options</button>}
      secondary={<button type="button">Preview</button>}
      primary={<button type="button">Post</button>}
    />
  );
  return { onBack };
}

describe("writeStatus", () => {
  it("puts an upload ahead of the save state", () => {
    expect(writeStatus({ saveLabel: "Draft saved", saveState: "cloud" }, true)).toEqual({
      label: "Adding image…",
      tone: "saving",
    });
  });

  it("says nothing when the draft has nothing to say", () => {
    expect(writeStatus({ saveLabel: "", saveState: "device" }, false)).toBeNull();
  });

  it.each([
    ["saving", "Saving…", "saving"],
    ["device", "Saving…", "saving"],
    ["cloud", "Draft saved", "saved"],
    ["idle", "Changes saved", "saved"],
    ["error", "We couldn't save this draft. Kept on this device.", "error"],
  ] as const)("reads %s as %s", (saveState, saveLabel, tone) => {
    expect(writeStatus({ saveLabel, saveState }, false)).toEqual({ label: saveLabel, tone });
  });
});

describe("WriteHeader", () => {
  afterEach(() => vi.useRealTimers());

  it("is Back, the status, the menu and the main button, in that order", () => {
    renderHeader({ label: "Draft saved", tone: "saved" });

    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(names).toEqual(["Back", "Save status: Draft saved", "More options", "Preview", "Post"]);
    expect(screen.getByRole("heading", { name: "New post" })).toHaveClass("sr-only");
  });

  it("goes Back", () => {
    const { onBack } = renderHeader(null);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(onBack).toHaveBeenCalled();
  });

  it("keeps the secondary action to wider screens", () => {
    renderHeader(null);

    expect(screen.getByRole("button", { name: "Preview" }).parentElement).toHaveClass("hidden", "md:flex");
  });

  it("is a dot on a phone that says what it means when tapped", () => {
    vi.useFakeTimers();
    renderHeader({ label: "Draft saved", tone: "saved" });

    const dot = screen.getByRole("button", { name: "Save status: Draft saved" });
    expect(dot).toHaveClass("md:hidden");
    fireEvent.click(dot);
    expect(screen.getAllByText("Draft saved").length).toBeGreaterThan(1);

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByText("Draft saved", { selector: "p.absolute" })).not.toBeInTheDocument();
  });

  it("announces the status once, for screen readers", () => {
    renderHeader({ label: "Saving…", tone: "saving" });

    expect(screen.getByText("Saving…", { selector: "[aria-live]" })).toHaveClass("sr-only");
  });

  it("gives a failure its own line, and a short word beside the dot", () => {
    renderHeader({ label: "We couldn't save this draft. Kept on this device.", tone: "error" });

    expect(screen.getByText("We couldn't save this draft. Kept on this device.", { selector: "p.bg-red-50" })).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("shows no status at all when there is nothing to say", () => {
    renderHeader(null);

    expect(screen.queryByRole("button", { name: /Save status/ })).not.toBeInTheDocument();
  });
});
