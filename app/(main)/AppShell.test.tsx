import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: vi.fn() }),
}));

function renderShell(pathname: string, showGuestBanner = false) {
  navigationState.pathname = pathname;
  const result = render(
    <AppShell
      showGuestBanner={showGuestBanner}
      userId="user-1"
      username="ada"
    >
      <p>page content</p>
    </AppShell>
  );
  return { ...result, main: result.container.querySelector("main") };
}

const railRoutes = [
  "/",
  "/explore",
  "/notifications",
  "/settings",
  "/post/a-published-piece",
  "/admin",
  "/admin/moderation",
];
const suppressedRoutes = ["/about", "/edit/a-published-piece"];

describe("AppShell", () => {
  it.each(railRoutes)("renders the rail on %s", (pathname) => {
    renderShell(pathname);
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
  });

  // The top bar is utilities only. Without the rail, a signed-in reader on an
  // article or an admin on desktop had the logo and nothing else to go back by.
  it.each(["/post/a-published-piece", "/admin/moderation"])(
    "keeps the canonical destinations reachable on %s",
    (pathname) => {
      const { main } = renderShell(pathname);
      const rail = screen.getByRole("navigation", { name: "Sections" });

      expect(Array.from(rail.children).map((item) => item.textContent)).toEqual([
        "Home",
        "Explore",
        "Write",
        "Notifications",
        "Profile",
      ]);
      expect(main?.className).toMatch(/\bmd:grid\b/);
    }
  );

  it.each(suppressedRoutes)("suppresses the rail on %s", (pathname) => {
    renderShell(pathname);
    expect(
      screen.queryByRole("navigation", { name: "Sections" })
    ).not.toBeInTheDocument();
  });

  // jsdom has no layout engine, so the responsive geometry is a class contract.
  // The rail is the desktop primary navigation from md, where the bottom bar
  // hands off, and it widens to its full column at xl.
  it("widens the container and becomes a grid only on rail routes", () => {
    const { main } = renderShell("/");
    expect(main?.className).toMatch(/\bmd:grid\b/);
    expect(main?.className).toMatch(/md:max-w-\[1480px\]/);
    expect(main?.className).toMatch(/md:grid-cols-\[160px_minmax\(0,1fr\)\]/);
    expect(main?.className).toMatch(/xl:grid-cols-\[184px_minmax\(0,1fr\)\]/);
  });

  it("leaves suppressed routes at the original container width", () => {
    const { main } = renderShell("/about");
    expect(main?.className).not.toMatch(/\b(?:md|xl):grid\b/);
    expect(main?.className).not.toMatch(/(?:md|xl):max-w-/);
    expect(main?.className).toMatch(/max-w-\[1240px\]/);
  });

  it("always wraps content in a min-w-0 column so wide children cannot blow out the track", () => {
    for (const pathname of ["/", "/admin/moderation", "/about"]) {
      const { unmount } = renderShell(pathname);
      expect(screen.getByText("page content").closest(".min-w-0")).not.toBeNull();
      unmount();
    }
  });

  it("keeps the guest banner inside the content column", () => {
    renderShell("/explore", true);
    const banner = screen.getByText(/Reading as a guest/i);
    expect(banner.closest(".min-w-0")).not.toBeNull();
  });

  it("omits the guest banner for signed-in viewers", () => {
    renderShell("/explore", false);
    expect(screen.queryByText(/Reading as a guest/i)).not.toBeInTheDocument();
  });
});
