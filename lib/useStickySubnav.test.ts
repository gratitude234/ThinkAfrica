import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStickySubnav } from "./useStickySubnav";

function subnavHeight() {
  return document.documentElement.style.getPropertyValue("--app-subnav-height");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // :root outlives every render.
  document.documentElement.removeAttribute("style");
});

function stubHeight(height: number) {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ height } as DOMRect);
}

function nodeRef(node: HTMLElement | null) {
  return { current: node };
}

describe("useStickySubnav", () => {
  // The height is the whole point: --app-subnav-offset resolves to minus this
  // number while the nav is retreated, so an unpublished or stale height leaves
  // a sliver of the strip stranded across the top of the screen.
  it("publishes the element's measured height to :root", () => {
    stubHeight(132);
    const node = document.createElement("div");

    renderHook(() => useStickySubnav(nodeRef(node)));

    expect(subnavHeight()).toBe("132px");
  });

  it("clears the height on unmount so the next route starts from zero", () => {
    stubHeight(132);
    const node = document.createElement("div");

    const { unmount } = renderHook(() => useStickySubnav(nodeRef(node)));
    expect(subnavHeight()).toBe("132px");

    unmount();
    expect(subnavHeight()).toBe("");
  });

  it("does nothing without an element", () => {
    renderHook(() => useStickySubnav(nodeRef(null)));

    expect(subnavHeight()).toBe("");
  });

  // The strip grows a row on the feed's Subscriptions tab and its chips wrap at
  // narrow widths, so a height measured once at mount goes stale.
  it("re-measures when the element resizes", () => {
    const rect = stubHeight(132);
    const node = document.createElement("div");
    let notify: (() => void) | null = null;

    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      }
    );

    renderHook(() => useStickySubnav(nodeRef(node)));
    expect(subnavHeight()).toBe("132px");

    rect.mockReturnValue({ height: 188 } as DOMRect);
    notify?.();
    expect(subnavHeight()).toBe("188px");
  });

  // jsdom has no ResizeObserver, and neither do older mobile browsers.
  it("falls back to resize events where ResizeObserver is missing", () => {
    const rect = stubHeight(132);
    const node = document.createElement("div");

    const { unmount } = renderHook(() => useStickySubnav(nodeRef(node)));

    rect.mockReturnValue({ height: 188 } as DOMRect);
    window.dispatchEvent(new Event("resize"));
    expect(subnavHeight()).toBe("188px");

    // The listener has to come off with the component, or a later resize
    // republishes a height for a strip that is no longer on the page.
    unmount();
    rect.mockReturnValue({ height: 240 } as DOMRect);
    window.dispatchEvent(new Event("resize"));
    expect(subnavHeight()).toBe("");
  });
});
