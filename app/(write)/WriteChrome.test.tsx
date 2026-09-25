import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(main)/NavClient", () => ({
  default: ({ onOpenSearch }: { onOpenSearch: () => void }) => (
    <nav aria-label="Application header">
      <button type="button" onClick={onOpenSearch}>
        Open search
      </button>
    </nav>
  ),
}));
vi.mock("@/components/ui/SearchOverlay", () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div role="dialog" aria-label="Search" /> : null),
}));

import WriteChrome from "./WriteChrome";

function show() {
  render(
    <WriteChrome user={null} profile={null} isAdmin={false}>
      <p>Composer</p>
    </WriteChrome>
  );
}

describe("WriteChrome", () => {
  it("shows the app navigation from md up, above the composer", () => {
    show();

    expect(screen.getByRole("navigation", { name: "Application header" }).parentElement).toHaveClass(
      "hidden",
      "md:contents"
    );
    expect(screen.getByText("Composer")).toBeInTheDocument();
  });

  it("opens search from the navigation", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Open search" }));

    expect(screen.getByRole("dialog", { name: "Search" })).toBeInTheDocument();
  });

  it("publishes the keyboard offset the phone toolbars sit on", () => {
    show();

    expect(document.documentElement.style.getPropertyValue("--mobile-visual-viewport-bottom")).toBe("0px");
  });
});
