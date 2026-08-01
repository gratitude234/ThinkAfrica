import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHasScrolled } from "./useHasScrolled";

function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event("scroll"));
  });
}

afterEach(() => {
  window.scrollY = 0;
});

describe("useHasScrolled", () => {
  it("starts false at the top of the page", () => {
    const { result } = renderHook(() => useHasScrolled());
    expect(result.current).toBe(false);
  });

  it("turns true once scrolled past the threshold", () => {
    const { result } = renderHook(() => useHasScrolled());

    scrollTo(50);
    expect(result.current).toBe(true);

    scrollTo(0);
    expect(result.current).toBe(false);
  });

  it("does not trip while still within the threshold", () => {
    const { result } = renderHook(() => useHasScrolled(100));

    scrollTo(80);
    expect(result.current).toBe(false);

    scrollTo(120);
    expect(result.current).toBe(true);
  });

  // A back-navigation restores scroll position before any scroll event fires.
  it("reads the scroll position on mount rather than waiting for an event", () => {
    window.scrollY = 400;
    const { result } = renderHook(() => useHasScrolled());
    expect(result.current).toBe(true);
  });

  it("removes its listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useHasScrolled());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function));
    removeSpy.mockRestore();
  });
});
