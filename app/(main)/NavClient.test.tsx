import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NavClient from "./NavClient";

// The auto-hide hook coalesces scroll events into a rAF, so frames are driven
// by hand here -- otherwise its callbacks land on a real timer after the test
// that scheduled them has finished.
let frames: Array<FrameRequestCallback | null> = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    frames.push(cb)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames[id - 1] = null;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.scrollY = 0;
  // --app-nav-offset lives on <html>, which outlives the render.
  document.documentElement.removeAttribute("style");
});

function scrollTo(y: number) {
  act(() => {
    window.scrollY = y;
    window.dispatchEvent(new Event("scroll"));
  });
  act(() => {
    const queued = frames;
    frames = [];
    queued.forEach((cb) => cb?.(0));
  });
}

function navOffset() {
  return document.documentElement.style.getPropertyValue("--app-nav-offset");
}

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

    const links = screen.getByRole("link", { name: "Home" }).parentElement;
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

    const strip = screen.getByText("Africa's intellectual social network");
    expect(strip.closest(".sticky")).toBeNull();
    expect(container.querySelector(".sticky")).not.toBeNull();
  });
});

describe("NavClient auto-hide", () => {
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

  // jsdom has no layout engine, so the movement itself is asserted through the
  // one variable that drives it: the bar pins at (offset - height) and every
  // sub-header at offset, so a published 0px is the whole stack retreating.
  it("publishes a zero offset once the reader scrolls down", () => {
    renderNav();
    expect(navOffset()).toBe("");

    scrollTo(400);
    expect(navOffset()).toBe("0px");
  });

  it("clears the offset again as soon as the reader scrolls up", () => {
    renderNav();

    scrollTo(400);
    expect(navOffset()).toBe("0px");

    scrollTo(340);
    expect(navOffset()).toBe("");
  });

  it("never retreats within the reveal floor", () => {
    renderNav();

    scrollTo(80);
    expect(navOffset()).toBe("");
  });

  it("holds the bar in place while focus is inside it", () => {
    renderNav();

    fireEvent.focus(screen.getByRole("link", { name: "Open messages" }));
    scrollTo(400);
    expect(navOffset()).toBe("");
  });

  it("stops publishing the offset once unmounted", () => {
    const { unmount } = renderNav();

    scrollTo(400);
    expect(navOffset()).toBe("0px");

    unmount();
    expect(navOffset()).toBe("");
  });
});
