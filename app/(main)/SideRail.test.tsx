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

    expect(hrefFor("For you")).toBe("/");
    expect(hrefFor("Discover")).toBe("/explore");
    expect(hrefFor("Campus")).toBe("/campus");
    expect(hrefFor("Research")).toBe("/research");
    expect(hrefFor("Debates")).toBe("/debates");
    expect(hrefFor("Responses")).toBe("/responses");
    expect(hrefFor("Opportunities")).toBe("/opportunities");
    expect(hrefFor("Bookmarks")).toBe("/bookmarks");
    expect(hrefFor("Messages")).toBe("/messages");
    expect(hrefFor("My record")).toBe("/me");
  });

  it("marks the current section with aria-current", () => {
    renderRail({}, "/");
    expect(screen.getByRole("link", { name: "For you" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Discover" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("treats /discover as the Discover section", () => {
    renderRail({}, "/discover");
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks the campus hub as its own section", () => {
    renderRail({}, "/campus");
    expect(screen.getByRole("link", { name: "Campus" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks research projects as their own section", () => {
    renderRail({}, "/research/projects/urban-water-access");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("keeps My record lit across the account surfaces", () => {
    renderRail({}, "/settings");
    expect(screen.getByRole("link", { name: "My record" })).toHaveAttribute(
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

  it("offers a Publish action", () => {
    renderRail();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("is hidden below the xl breakpoint", () => {
    // jsdom has no layout engine, so the responsive contract is asserted on the
    // utility classes, as elsewhere in this suite.
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("hidden", "xl:block");
  });

  // Every sticky aside in the app pins at the nav's live offset + 1rem. The
  // rail sits in the same viewport as the home sidebar and the feed's tab
  // strip, so a different offset -- or the measured height, which does not move
  // when the nav retreats -- is visible as columns starting out of line.
  it("pins at the shared sticky offset", () => {
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("xl:top-[var(--app-sticky-offset)]");
    expect(rail.className).not.toMatch(/transition-\[top\]/);
  });
});
