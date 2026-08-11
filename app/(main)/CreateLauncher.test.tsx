import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateLauncher from "./CreateLauncher";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

describe("CreateLauncher -- direct-to-composer", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    mocks.push.mockReset();
  });

  afterEach(() => cleanup());

  it("navigates the mobile FAB straight to the Post composer, with no chooser dialog", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    expect(mocks.push).toHaveBeenCalledWith("/create/post");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates the desktop Create button straight to the Post composer", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(mocks.push).toHaveBeenCalledWith("/create/post");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the contextual sign-in gate for a guest instead of navigating", () => {
    render(<CreateLauncher userId={null} variant="mobileHeader" />);

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("gives the desktop trigger and mobile trigger distinct accessible names", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileHeader" />
      </>
    );

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start writing" })).toBeInTheDocument();
  });

  // jsdom has no real layout/media-query engine, so this can't be proven by
  // resizing a viewport -- it asserts on the Tailwind breakpoint utilities
  // that *are* the visibility contract, the same way the rest of NavClient's
  // responsive chrome (search bar, desktop nav links, BottomNav)
  // switches at `md`. Both Create controls must flip at that identical
  // token, or there is a window (previously 640-767px, `sm` vs `md`) where
  // both are visible at once.
  it("flips the desktop and mobile controls at the identical `md` breakpoint, with no `sm` gap between them", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileHeader" />
      </>
    );

    const desktopWrapper = screen.getByRole("button", { name: "Create" }).parentElement;
    const mobileWrapper = screen.getByRole("button", { name: "Start writing" }).parentElement;

    // Desktop control: hidden by default, appears only from `md` up.
    expect(desktopWrapper).toHaveClass("hidden", "md:inline-flex");
    expect(desktopWrapper?.className).not.toMatch(/\bsm:/);

    // Mobile control: visible by default, disappears at that same `md` token
    // -- so there is no breakpoint at which both wrappers are unhidden.
    expect(mobileWrapper).toHaveClass("md:hidden");
  });

  it("keeps the browse-screen trigger in flow instead of floating over content", () => {
    render(<CreateLauncher userId="user-1" variant="mobileHeader" />);

    const trigger = screen.getByRole("button", { name: "Start writing" });
    expect(trigger).not.toHaveClass("fixed");
    expect(trigger).not.toHaveAttribute("data-app-compose-fab");
    expect(trigger.parentElement).toHaveClass("md:hidden");
  });

  it("keeps the post FAB clear of the reading bar", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    const fab = screen.getByRole("button", { name: "Start writing" });

    expect(fab).toHaveAttribute("data-app-compose-fab");
    expect(fab).toHaveAttribute("data-app-chrome-motion");
    expect(fab).toHaveAttribute("data-app-compose-fab-static");
    expect(fab).toHaveStyle({
      bottom:
        "calc(112px + env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))",
    });
  });
});
