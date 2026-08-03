import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StickySubnav from "./StickySubnav";

function strip(container: HTMLElement) {
  const node = container.querySelector("[data-app-context-nav]");
  if (!node) throw new Error("sticky sub-header not found");
  return node;
}

describe("StickySubnav", () => {
  it("pins beneath the measured nav and registers a sentinel", () => {
    const { container } = render(
      <StickySubnav>
        <span>Tabs</span>
      </StickySubnav>
    );

    expect(strip(container)).toHaveAttribute("data-app-context-nav");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  // Pinning, offset and easing live in one CSS rule keyed off the marker
  // attribute, so a caller cannot pin at a stale offset or forget to move.
  it("owns the movement so callers cannot forget it", () => {
    const { container } = render(
      <StickySubnav>
        <span>Tabs</span>
      </StickySubnav>
    );

    expect(strip(container)).toHaveAttribute("data-app-context-nav");
    expect(strip(container)).toHaveAttribute("data-app-chrome-motion");
    expect(strip(container)).not.toHaveClass("sticky");
  });

  it("keeps the caller's own styling", () => {
    const { container } = render(
      <StickySubnav className="z-40 border-b bg-white/95">
        <span>Tabs</span>
      </StickySubnav>
    );

    expect(strip(container)).toHaveClass("z-40", "border-b", "bg-white/95");
  });

});
