import type { AnchorHTMLAttributes } from "react";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateLauncher from "./CreateLauncher";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));
const mocks = vi.hoisted(() => ({ requestAuth: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

// next/link's app-router Link expects a live router context to handle clicks
// client-side; these unit tests render CreateLauncher in isolation, so clicks
// are exercised against a plain anchor instead -- href/onClick are what the
// chooser actually contracts on, not Link's own router wiring.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

describe("CreateLauncher -- mobile bottom sheet", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("opens the chooser instead of navigating straight to /write", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);

    expect(screen.queryByRole("link", { name: "Start writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    expect(screen.getByRole("dialog", { name: "Create" })).toBeInTheDocument();
  });

  it("renders exactly Post, Article, and Research Paper", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialog = screen.getByRole("dialog", { name: "Create" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^Post/);
    expect(links[1]).toHaveAccessibleName(/^Article/);
    expect(links[2]).toHaveAccessibleName(/^Research Paper/);
  });

  it("never surfaces Essay, Policy Brief, or Blog as their own top-level choice", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialog = screen.getByRole("dialog");
    const linkNames = within(dialog)
      .getAllByRole("link")
      .map((link) => link.textContent?.toLowerCase() ?? "");

    expect(linkNames.some((name) => name === "essay")).toBe(false);
    expect(linkNames.some((name) => name === "policy brief")).toBe(false);
    expect(linkNames.some((name) => name === "blog")).toBe(false);
  });

  it("routes Post, Article, and Research Paper to their composers for a signed-in user", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("link", { name: /^Post/ })).toHaveAttribute(
      "href",
      "/create/post"
    );
    expect(within(dialog).getByRole("link", { name: /^Article/ })).toHaveAttribute(
      "href",
      "/write?kind=article"
    );
    expect(within(dialog).getByRole("link", { name: /^Research Paper/ })).toHaveAttribute(
      "href",
      "/submit/research"
    );
  });

  it("opens the contextual sign-in gate for a guest instead of the chooser", () => {
    render(<CreateLauncher userId={null} variant="mobileFab" />);

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("moves focus inside the sheet on open", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("traps Tab focus inside the sheet, wrapping from the last option back to Close", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialog = screen.getByRole("dialog");
    const links = within(dialog).getAllByRole("link");
    links[links.length - 1].focus();
    expect(document.activeElement).toBe(links[links.length - 1]);

    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("closes via the close button and restores focus to the trigger", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    const trigger = screen.getByRole("button", { name: "Start writing" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes via the backdrop", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement?.querySelector("[aria-hidden='true']");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as Element);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    const trigger = screen.getByRole("button", { name: "Start writing" });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes as soon as an option is selected", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("link", { name: /^Post/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not create a draft or navigate merely by opening", () => {
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    const pathBefore = window.location.pathname;

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    expect(window.location.pathname).toBe(pathBefore);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("CreateLauncher -- desktop popover", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("opens a compact anchored popover, not a full-screen modal", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);
    const trigger = screen.getByRole("button", { name: "Create" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", expect.any(String));
    const dialog = screen.getByRole("dialog", { name: "Create" });
    expect(dialog).not.toHaveAttribute("aria-modal", "true");
  });

  it("closes on outside click and restores focus to the trigger", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);
    const trigger = screen.getByRole("button", { name: "Create" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);
    const trigger = screen.getByRole("button", { name: "Create" });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on route change", () => {
    const { rerender } = render(<CreateLauncher userId="user-1" variant="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    navigationState.pathname = "/write";
    rerender(<CreateLauncher userId="user-1" variant="desktop" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes as soon as an option is selected", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByRole("link", { name: /^Article/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not create a draft or navigate merely by opening", () => {
    render(<CreateLauncher userId="user-1" variant="desktop" />);
    const pathBefore = window.location.pathname;

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(window.location.pathname).toBe(pathBefore);
  });
});

describe("CreateLauncher -- no duplicate accessibility labels", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("gives the desktop trigger and mobile trigger distinct accessible names", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileFab" />
      </>
    );

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start writing" })).toBeInTheDocument();
  });

  it("keeps each open dialog's accessible name tied to its own unique title element", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileFab" />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    const dialogs = screen.getAllByRole("dialog", { name: "Create" });
    expect(dialogs).toHaveLength(2);
    const labelledByIds = dialogs.map((dialog) => dialog.getAttribute("aria-labelledby"));
    expect(new Set(labelledByIds).size).toBe(2);
  });
});

describe("CreateLauncher -- responsive breakpoint contract", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  // jsdom has no real layout/media-query engine, so this can't be proven by
  // resizing a viewport -- it asserts on the Tailwind breakpoint utilities
  // that *are* the visibility contract, the same way the rest of NavClient's
  // responsive chrome (search bar, desktop nav links, MobileNav, BottomNav)
  // switches at `md`. Both Create controls must flip at that identical
  // token, or there is a window (previously 640-767px, `sm` vs `md`) where
  // both are visible at once.
  it("flips the desktop and mobile controls at the identical `md` breakpoint, with no `sm` gap between them", () => {
    render(
      <>
        <CreateLauncher userId="user-1" variant="desktop" />
        <CreateLauncher userId="user-1" variant="mobileFab" />
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
});
