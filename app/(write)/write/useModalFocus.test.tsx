import { useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModalFocus } from "./useModalFocus";

function Preview({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(true, ref, onClose);
  return <div ref={ref} role="dialog">
    <button hidden>Mobile Back</button>
    <button>Close preview</button>
    <a href="#source">Source</a>
    <button style={{ visibility: "hidden" }}>Hidden last control</button>
  </div>;
}

describe("responsive modal focus", () => {
  afterEach(() => vi.restoreAllMocks());

  it("focuses and wraps through visible controls, skipping responsive hidden controls", async () => {
    // jsdom has no layout; represent the browser's rendered rectangles.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
      return (this.hidden ? [] : [{}]) as unknown as DOMRectList;
    });
    const close = vi.fn();
    render(<Preview onClose={close} />);
    const first = screen.getByRole("button", { name: "Close preview" });
    const last = screen.getByRole("link", { name: "Source" });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
});
