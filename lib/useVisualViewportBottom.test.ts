import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisualViewportBottom } from "./useVisualViewportBottom";

let frames: Array<FrameRequestCallback | null> = [];

function flushFrames() {
  const pending = frames;
  frames = [];
  pending.forEach((callback) => callback?.(0));
}

function viewport(height: number) {
  const visualViewport = {
    height,
    offsetTop: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("visualViewport", visualViewport);
  return visualViewport;
}

/** The box a `position: fixed; bottom: 0` element is measured from. */
function fixedBoxHeight(height: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    width: 0,
    height,
    bottom: height,
    toJSON: () => ({}),
  });
}

function layoutHeights({ inner, client }: { inner: number; client: number }) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: inner });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: client });
}

function focusTextField() {
  const field = document.createElement("textarea");
  document.body.appendChild(field);
  field.focus();
}

const offset = () => document.documentElement.style.getPropertyValue("--mobile-visual-viewport-bottom");

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("useVisualViewportBottom", () => {
  it("measures the keyboard against the box fixed controls sit in, not an estimate of it", () => {
    // Chrome for Android, edge to edge (viewport-fit=cover): fixed controls
    // reach under the 16px gesture bar, but neither innerHeight nor the
    // initial containing block counts it. The keyboard leaves 400px showing,
    // so it covers 716 - 400 = 316px of that box. Subtracting from 700
    // instead left every toolbar 16px under the keyboard.
    layoutHeights({ inner: 700, client: 700 });
    fixedBoxHeight(716);
    viewport(400);
    focusTextField();

    renderHook(() => useVisualViewportBottom());
    flushFrames();

    expect(offset()).toBe("316px");
  });

  it("falls back to the layout viewport where the fixed box cannot be measured", () => {
    layoutHeights({ inner: 700, client: 700 });
    fixedBoxHeight(0);
    viewport(400);
    focusTextField();

    renderHook(() => useVisualViewportBottom());
    flushFrames();

    expect(offset()).toBe("300px");
  });

  it("stays at 0px while nothing editable has focus", () => {
    layoutHeights({ inner: 700, client: 700 });
    fixedBoxHeight(716);
    viewport(400);

    renderHook(() => useVisualViewportBottom());
    flushFrames();

    expect(offset()).toBe("0px");
  });

  it("hides navigation during keyboard use and restores it on dismissal", () => {
    fixedBoxHeight(800);
    const vv = viewport(400);
    focusTextField();
    const { unmount } = renderHook(() => useVisualViewportBottom());
    flushFrames();
    expect(document.documentElement.hasAttribute("data-mobile-keyboard")).toBe(true);
    vv.height = 800;
    document.dispatchEvent(new Event("focusin"));
    flushFrames();
    expect(document.documentElement.hasAttribute("data-mobile-keyboard")).toBe(false);
    unmount();
  });

  it("reveals composer actions without fighting viewport scrolling", () => {
    fixedBoxHeight(800);
    const vv = viewport(400);
    const composer = document.createElement("div");
    composer.setAttribute("data-keyboard-composer", "");
    const field = document.createElement("textarea");
    composer.appendChild(field);
    document.body.appendChild(composer);
    field.focus();
    Object.defineProperty(composer, "getBoundingClientRect", { value: () => ({
      top: 200, bottom: 470, height: 270,
    }) });
    const scroll = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    renderHook(() => useVisualViewportBottom());
    flushFrames();
    expect(scroll).toHaveBeenCalledWith({ top: 86, behavior: "instant" });
    scroll.mockClear();
    const onScroll = vv.addEventListener.mock.calls.find(([name]) => name === "scroll")![1];
    onScroll(new Event("scroll"));
    flushFrames();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("removes what it added when unmounted", () => {
    layoutHeights({ inner: 700, client: 700 });
    viewport(400);
    const container = document.body.appendChild(document.createElement("div"));

    const { unmount } = renderHook(() => useVisualViewportBottom(), { container });
    unmount();

    expect(Array.from(document.body.children)).toEqual([container]);
    expect(offset()).toBe("");
  });
});
