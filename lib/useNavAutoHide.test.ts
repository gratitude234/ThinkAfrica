import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNavAutoHide } from "./useNavAutoHide";

// rAF is driven by hand rather than left to jsdom's timer, so the coalescing
// this hook exists to do can be asserted instead of merely tolerated.
let frames: Array<FrameRequestCallback | null> = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    frames.push(cb)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.scrollY = 0;
});

function scroll(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event("scroll"));
  });
}

function flushFrames() {
  act(() => {
    const queued = frames;
    frames = [];
    queued.forEach((cb) => cb?.(0));
  });
}

function scrollTo(y: number) {
  scroll(y);
  flushFrames();
}

/** jsdom reports no layout, so the scrollable range has to be faked. */
function setScrollRange(height: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: height,
    configurable: true,
  });
}

describe("useNavAutoHide", () => {
  it("starts revealed at the top of the page", () => {
    const { result } = renderHook(() => useNavAutoHide());
    expect(result.current).toBe(false);
  });

  it("retreats on a downward scroll past the reveal floor", () => {
    const { result } = renderHook(() => useNavAutoHide());

    scrollTo(400);
    expect(result.current).toBe(true);
  });

  it("stays revealed below the floor, where the sub-headers have not pinned", () => {
    const { result } = renderHook(() => useNavAutoHide());

    scrollTo(80);
    expect(result.current).toBe(false);
  });

  it("comes back on any upward scroll", () => {
    const { result } = renderHook(() => useNavAutoHide());

    scrollTo(400);
    expect(result.current).toBe(true);

    scrollTo(340);
    expect(result.current).toBe(false);
  });

  it("ignores sub-threshold jitter", () => {
    const { result } = renderHook(() => useNavAutoHide());

    scrollTo(400);
    expect(result.current).toBe(true);

    // A 3px twitch upward is a trackpad, not a reader changing their mind.
    scrollTo(397);
    expect(result.current).toBe(true);
  });

  it("accumulates sub-threshold movement instead of rebasing on it", () => {
    const { result } = renderHook(() => useNavAutoHide());

    // Four 3px steps: no single one clears the threshold, but a slow drag has
    // to read as a direction eventually.
    scrollTo(200);
    scrollTo(203);
    scrollTo(206);
    scrollTo(209);
    expect(result.current).toBe(true);
  });

  it("coalesces a burst of scroll events into a single frame", () => {
    const { result } = renderHook(() => useNavAutoHide());

    scroll(200);
    scroll(300);
    scroll(400);
    expect(frames.filter(Boolean)).toHaveLength(1);

    flushFrames();
    expect(result.current).toBe(true);
  });

  it("does not flash on overscroll at the end of the document", () => {
    // 1268 - 768 leaves 500px of real scroll range.
    setScrollRange(1268);
    window.innerHeight = 768;

    const { result } = renderHook(() => useNavAutoHide());

    scrollTo(480);
    expect(result.current).toBe(true);

    // iOS rubber-banding reports past the end and then unwinds. Both positions
    // clamp to 500, so there is no reversal to react to.
    scrollTo(600);
    scrollTo(540);
    expect(result.current).toBe(true);

    setScrollRange(0);
  });

  it("is force-revealed while disabled, and ignores scrolling", () => {
    const { result } = renderHook(() => useNavAutoHide({ disabled: true }));

    scrollTo(400);
    expect(result.current).toBe(false);
  });

  it("comes back when the reveal key changes", () => {
    const { result, rerender } = renderHook(
      ({ revealKey }) => useNavAutoHide({ revealKey }),
      { initialProps: { revealKey: "/" } }
    );

    scrollTo(400);
    expect(result.current).toBe(true);

    rerender({ revealKey: "/explore" });
    expect(result.current).toBe(false);
  });

  it("stays revealed at widths outside its media query", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    );

    const { result } = renderHook(() =>
      useNavAutoHide({ mediaQuery: "(max-width: 1023px)" })
    );

    scrollTo(400);
    expect(result.current).toBe(false);
  });

  // jsdom does not implement matchMedia, so the typeof guard is load-bearing.
  it("works without window.matchMedia", () => {
    const { result } = renderHook(() =>
      useNavAutoHide({ mediaQuery: "(max-width: 1023px)" })
    );

    scrollTo(400);
    expect(result.current).toBe(true);
  });

  it("removes its listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useNavAutoHide());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    removeSpy.mockRestore();
  });
});
