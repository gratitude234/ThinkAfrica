import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StickySubnav from "./StickySubnav";

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("style");
});

function strip(container: HTMLElement) {
  const node = container.firstElementChild;
  if (!node) throw new Error("sticky sub-header not found");
  return node;
}

describe("StickySubnav", () => {
  // --app-subnav-offset is the nav's bottom edge while the nav is revealed and
  // minus the strip's own height once it has retreated. --app-nav-offset would
  // pin it at 0 instead, which is a bar glued to the top of a screen the reader
  // has already scrolled past.
  it("pins at the retreating sub-header offset", () => {
    const { container } = render(
      <StickySubnav>
        <span>Tabs</span>
      </StickySubnav>
    );

    expect(strip(container)).toHaveClass("sticky");
    expect(strip(container)).toHaveClass("top-[var(--app-subnav-offset)]");
  });

  it("owns the movement so callers cannot forget it", () => {
    const { container } = render(
      <StickySubnav>
        <span>Tabs</span>
      </StickySubnav>
    );

    expect(strip(container)).toHaveClass("transition-[top]");
    expect(strip(container)).toHaveClass("motion-reduce:transition-none");
  });

  it("keeps the caller's own styling", () => {
    const { container } = render(
      <StickySubnav className="z-40 border-b bg-white/95">
        <span>Tabs</span>
      </StickySubnav>
    );

    expect(strip(container)).toHaveClass("z-40", "border-b", "bg-white/95");
  });

  it("publishes its height for the retreat to clear, and takes it back down", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      height: 96,
    } as DOMRect);

    const { unmount } = render(
      <StickySubnav>
        <span>Tabs</span>
      </StickySubnav>
    );
    expect(
      document.documentElement.style.getPropertyValue("--app-subnav-height")
    ).toBe("96px");

    unmount();
    expect(
      document.documentElement.style.getPropertyValue("--app-subnav-height")
    ).toBe("");
  });
});
