import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStickySubnav } from "./useStickySubnav";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  registerSubnav: vi.fn(),
}));

vi.mock("@/app/(main)/AppChromeProvider", () => ({
  useAppChrome: () => ({ registerSubnav: mocks.registerSubnav }),
}));

function nodeRef<T extends HTMLElement>(node: T | null) {
  return { current: node };
}

describe("useStickySubnav", () => {
  beforeEach(() => {
    mocks.cleanup.mockReset();
    mocks.registerSubnav.mockReset();
    mocks.registerSubnav.mockReturnValue(mocks.cleanup);
  });

  it("registers the sticky element with its honest in-flow anchor", () => {
    const node = document.createElement("div");
    const anchor = document.createElement("div");

    renderHook(() => useStickySubnav(nodeRef(node), nodeRef(anchor)));

    expect(mocks.registerSubnav).toHaveBeenCalledWith(node, anchor);
  });

  it("releases only its own registration on unmount", () => {
    const node = document.createElement("div");
    const { unmount } = renderHook(() => useStickySubnav(nodeRef(node)));

    unmount();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });

  it("does not register until an element exists", () => {
    renderHook(() => useStickySubnav(nodeRef(null)));
    expect(mocks.registerSubnav).not.toHaveBeenCalled();
  });
});
