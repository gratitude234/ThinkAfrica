import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SideRail from "./SideRail";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));
const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

function renderRail(
  overrides: Partial<Parameters<typeof SideRail>[0]> = {},
  pathname = "/"
) {
  navigationState.pathname = pathname;
  return render(
    <SideRail
      userId="user-1"
      username="ada"
      {...overrides}
    />
  );
}

const RETIRED_DESTINATIONS = [
  "For you",
  "Discover",
  "Responses",
  "Campus",
  "Research",
  "My record",
  "Record",
  "Opportunities",
  "Messages",
  "Leaderboard",
  "Fellowships",
  "Talent",
];

describe("SideRail", () => {
  it("links the five primary destinations in order", () => {
    renderRail();

    const hrefFor = (name: string) =>
      screen.getByRole("link", { name }).getAttribute("href");

    expect(hrefFor("Home")).toBe("/");
    expect(hrefFor("Explore")).toBe("/explore");
    expect(screen.getByRole("button", { name: "Write" })).toBeInTheDocument();
    expect(hrefFor("Notifications")).toBe("/notifications");
    expect(hrefFor("Profile")).toBe("/ada");

    const labels = Array.from(
      screen.getByRole("navigation", { name: "Sections" }).children
    ).map((item) => item.textContent);
    expect(labels).toEqual(["Home", "Explore", "Write", "Notifications", "Profile"]);
  });

  it.each(RETIRED_DESTINATIONS)("no longer offers %s", (name) => {
    renderRail();
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
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

  it("treats /discover and /search as Explore", () => {
    for (const pathname of ["/discover", "/search"]) {
      const { unmount } = renderRail({}, pathname);
      expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute(
        "aria-current",
        "page"
      );
      unmount();
    }
  });

  it("keeps Profile lit across the account surfaces", () => {
    renderRail({}, "/settings");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("routes guests through the sign-in gate", () => {
    mocks.requestAuth.mockReset();
    renderRail({ userId: null, username: null });

    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "/signup"
    );
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fnotifications"
    );

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      destination: "/write",
    });
  });

  it("takes a signed-in writer to the composer", () => {
    mocks.push.mockReset();
    renderRail();
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(mocks.push).toHaveBeenCalledWith("/write");
  });

  it("is hidden below the xl breakpoint", () => {
    // jsdom has no layout engine, so the responsive contract is asserted on the
    // utility classes, as elsewhere in this suite.
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("hidden", "xl:block");
  });

  // Every sticky aside in the app pins at the nav's live offset + 1rem, so
  // columns in the same viewport start in line.
  it("pins at the shared sticky offset", () => {
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("xl:top-[var(--app-sticky-offset)]");
    expect(rail?.className).not.toMatch(/transition-\[top\]/);
  });

  // The rail scrolls inside itself on a short window, but the gesture has to
  // carry on into the page once it bottoms out.
  it("lets a wheel gesture chain from the rail into the page", () => {
    const { container } = renderRail();
    const rail = container.querySelector("aside");
    expect(rail).toHaveClass("xl:overflow-y-auto");
    expect(rail?.className).not.toMatch(/overscroll/);
  });
});
