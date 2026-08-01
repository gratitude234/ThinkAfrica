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
vi.mock("@/components/ui/MessagesUnreadBadge", () => ({ default: () => null }));

function renderShell(pathname: string, showGuestBanner = false) {
  navigationState.pathname = pathname;
  const result = render(
    <AppShell
      showGuestBanner={showGuestBanner}
      userId="user-1"
      username="ada"
      hasActiveDebate={false}
    >
      <p>page content</p>
    </AppShell>
  );
  return { ...result, main: result.container.querySelector("main") };
}

const railRoutes = ["/", "/explore", "/debates", "/opportunities", "/settings"];
const suppressedRoutes = [
  "/post/a-published-piece",
  "/messages",
  "/messages/conversation-1",
  "/admin/review",
  "/debates/live-room",
  "/about",
];

describe("AppShell", () => {
  it.each(railRoutes)("renders the rail on %s", (pathname) => {
    renderShell(pathname);
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeInTheDocument();
  });

  it.each(suppressedRoutes)("suppresses the rail on %s", (pathname) => {
    renderShell(pathname);
    expect(
      screen.queryByRole("navigation", { name: "Sections" })
    ).not.toBeInTheDocument();
  });

  // jsdom has no layout engine, so the responsive geometry is a class contract.
  it("widens the container and becomes a grid only on rail routes", () => {
    const { main } = renderShell("/");
    expect(main?.className).toMatch(/\bxl:grid\b/);
    expect(main?.className).toMatch(/xl:max-w-\[1360px\]/);
    expect(main?.className).toMatch(/xl:grid-cols-\[200px_minmax\(0,1fr\)\]/);
  });

  it("leaves suppressed routes at the original container width", () => {
    const { main } = renderShell("/messages");
    expect(main?.className).not.toMatch(/\bxl:grid\b/);
    expect(main?.className).not.toMatch(/xl:max-w-/);
    expect(main?.className).toMatch(/max-w-\[1240px\]/);
  });

  it("always wraps content in a min-w-0 column so wide children cannot blow out the track", () => {
    for (const pathname of ["/", "/messages"]) {
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
