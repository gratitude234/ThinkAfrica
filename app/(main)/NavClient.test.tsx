import { act, render, screen } from "@testing-library/react";
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

vi.mock("./CreateLauncher", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/NotificationBell", () => ({
  default: () => <button type="button">Notifications</button>,
}));

vi.mock("@/components/ui/MessagesUnreadBadge", () => ({
  default: () => null,
}));

describe("NavClient mobile Messages visibility", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  it("hides the shortcut on mobile when the bottom navigation is present", () => {
    render(
      <NavClient
        user={null}
        profile={null}
        isAdmin={false}
        canAccessReview={false}
        onOpenSearch={vi.fn()}
      />
    );

    const messages = screen.getByRole("link", { name: "Open messages" });
    expect(messages).toHaveClass("hidden");
    expect(messages).toHaveClass("md:flex");
    expect(
      screen.queryByRole("button", { name: "Open more menu" })
    ).not.toBeInTheDocument();
  });

  it("shows the shortcut on mobile when a post hides the bottom navigation", () => {
    navigationState.pathname = "/post/a-published-piece";

    render(
      <NavClient
        user={null}
        profile={null}
        isAdmin={false}
        canAccessReview={false}
        onOpenSearch={vi.fn()}
      />
    );

    const messages = screen.getByRole("link", { name: "Open messages" });
    expect(messages).toHaveClass("flex");
    expect(messages).not.toHaveClass("hidden");
  });
});

describe("NavClient desktop nav handoff", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  function renderNav() {
    return render(
      <NavClient
        user={null}
        profile={null}
        isAdmin={false}
        canAccessReview={false}
        onOpenSearch={vi.fn()}
      />
    );
  }

  // jsdom has no layout engine, so the breakpoint handoff to SideRail is
  // asserted on the utility classes.
  it("hands the primary links to the side rail at xl", () => {
    renderNav();

    const links = screen.getByRole("link", { name: "For you" }).parentElement;
    expect(links).toHaveClass("xl:hidden");
  });

  it("widens the search field once the links are gone", () => {
    renderNav();

    const search = screen.getByRole("button", { name: "Open search" });
    expect(search).toHaveClass("xl:max-w-[520px]");
    // Cancels ml-auto, which would otherwise strand search on the right.
    expect(search).toHaveClass("xl:ml-0");
  });

  it("gains a shadow once the page is scrolled, and loses it at the top", () => {
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(nav.className).not.toMatch(/shadow-/);

    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(nav.className).toMatch(/shadow-/);

    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(nav.className).not.toMatch(/shadow-/);
  });

  it("leaves the announcement strip outside the sticky wrapper", () => {
    const { container } = renderNav();

    const strip = screen.getByText("Africa's First Intellectual Social Network");
    expect(strip.closest(".sticky")).toBeNull();
    expect(container.querySelector(".sticky")).not.toBeNull();
  });
});

describe("NavClient shared chrome contract", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  function renderNav() {
    return render(
      <NavClient
        user={null}
        profile={null}
        isAdmin={false}
        canAccessReview={false}
        onOpenSearch={vi.fn()}
      />
    );
  }

  it("registers as the primary composited chrome surface", () => {
    const { container } = renderNav();
    const sticky = container.querySelector<HTMLElement>("[data-app-primary-nav]");

    expect(sticky).toHaveAttribute("data-app-chrome-motion");
    expect(sticky).toHaveClass("sticky", "top-0", "transition-transform");
    expect(document.documentElement).not.toHaveAttribute("data-nav-hidden");
  });
});
