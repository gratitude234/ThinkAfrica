import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SideRail from "./SideRail";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: vi.fn() }),
}));
// The real badge opens a Supabase channel and needs live env vars.
vi.mock("@/components/ui/MessagesUnreadBadge", () => ({ default: () => null }));

function renderRail(
  overrides: Partial<Parameters<typeof SideRail>[0]> = {},
  pathname = "/"
) {
  navigationState.pathname = pathname;
  return render(
    <SideRail
      userId="user-1"
      username="ada"
      hasActiveDebate={false}
      {...overrides}
    />
  );
}

describe("SideRail", () => {
  it("links every primary destination", () => {
    renderRail();

    const hrefFor = (name: string) =>
      screen.getByRole("link", { name }).getAttribute("href");

    expect(hrefFor("Home")).toBe("/");
    expect(hrefFor("Explore")).toBe("/explore");
    expect(hrefFor("Debates")).toBe("/debates");
    expect(hrefFor("Opportunities")).toBe("/opportunities");
    expect(hrefFor("Bookmarks")).toBe("/bookmarks");
    expect(hrefFor("Messages")).toBe("/messages");
    expect(hrefFor("Me")).toBe("/me");
  });

  it("marks the current section with aria-current", () => {
    renderRail({}, "/");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Explore" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("treats /discover as the Explore section", () => {
    renderRail({}, "/discover");
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("keeps Me lit across the account surfaces", () => {
    renderRail({}, "/settings");
    expect(screen.getByRole("link", { name: "Me" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("announces a live debate only while one is running", () => {
    const { unmount } = renderRail({ hasActiveDebate: true });
    expect(screen.getByText("A debate is live now")).toBeInTheDocument();
    unmount();

    renderRail({ hasActiveDebate: false });
    expect(screen.queryByText("A debate is live now")).not.toBeInTheDocument();
  });

  it("routes guests through the sign-in gate", () => {
    renderRail({ userId: null, username: null });

    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "/signup"
    );
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fmessages"
    );
    expect(screen.getByRole("link", { name: "Bookmarks" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fbookmarks"
    );
  });

  it("offers a Create action", () => {
    renderRail();
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
  });

  it("is hidden below the xl breakpoint", () => {
    // jsdom has no layout engine, so the responsive contract is asserted on the
    // utility classes, as elsewhere in this suite.
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("hidden", "xl:block");
  });

  // Every sticky aside in the app pins at nav height + 1rem. The rail sits in
  // the same viewport as the home sidebar, so a different offset is visible as
  // two columns starting out of line.
  it("pins at the shared sticky offset", () => {
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("xl:top-[calc(var(--app-nav-height)+1rem)]");
  });
});
