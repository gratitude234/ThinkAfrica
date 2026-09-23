import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NavClient from "./NavClient";

afterEach(() => {
  vi.unstubAllGlobals();
  window.scrollY = 0;
  // --app-nav-offset lives on <html>, which outlives the render.
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-nav-hidden");
});

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/components/ui/BrandWordmark", () => ({
  default: () => <span>Indegenius</span>,
}));

vi.mock("./NavUserMenu", () => ({
  default: () => <span>Account menu</span>,
}));

function renderNav(user: { id: string } | null = null, onOpenSearch = vi.fn()) {
  return render(
    <NavClient
      user={user as Parameters<typeof NavClient>[0]["user"]}
      profile={null}
      isAdmin={false}
      onOpenSearch={onOpenSearch}
    />
  );
}

/**
 * The top bar is global utilities only: the wordmark home, search and the
 * account menu. Home, Explore, Write, Notifications and Profile live in the
 * side rail and the bottom bar, and are not repeated here.
 */
describe("NavClient utilities", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  it("links the wordmark home", () => {
    renderNav();

    expect(screen.getByRole("link", { name: "Indegenius home" })).toHaveAttribute("href", "/");
  });

  it("repeats none of the primary destinations, and nothing from the retired product", () => {
    renderNav({ id: "user-1" });

    for (const name of ["Home", "Explore", "Write", "Notifications", "Profile"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    for (const name of ["For you", "Discover", "Responses", "Campus", "Research", "Open messages"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("opens search from the responsive utility trigger", () => {
    const onOpenSearch = vi.fn();
    renderNav(null, onOpenSearch);

    const search = screen.getByRole("button", { name: "Open search" });
    // jsdom has no layout engine, so the breakpoint is a class contract.
    expect(search).toHaveClass("app-search-trigger");
    expect(search).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(search);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("carries the account menu", () => {
    renderNav({ id: "user-1" });

    expect(screen.getByText("Account menu")).toBeInTheDocument();
  });

  it("carries no announcement strip", () => {
    renderNav();

    expect(screen.queryByText(/Intellectual Social Network/)).not.toBeInTheDocument();
  });

  it("keeps the flat header treatment while scrolling", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Application header" });

    expect(nav.className).not.toMatch(/shadow-/);

    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(nav.className).not.toMatch(/shadow-/);

    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(nav.className).not.toMatch(/shadow-/);
  });
});

describe("NavClient shared chrome contract", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  it("registers as the primary composited chrome surface", () => {
    const { container } = renderNav();
    const sticky = container.querySelector<HTMLElement>("[data-app-primary-nav]");

    expect(sticky).toHaveAttribute("data-app-chrome-motion");
    expect(sticky).toHaveClass("sticky", "top-0", "transition-transform");
    expect(document.documentElement).not.toHaveAttribute("data-nav-hidden");
  });
});
