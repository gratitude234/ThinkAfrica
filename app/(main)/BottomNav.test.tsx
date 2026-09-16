import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));
const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

describe("BottomNav destinations", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("offers Home, Explore, Write, Notifications and Profile, in that order", () => {
    render(<BottomNav username="writer" userId="user-1" />);

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    const labels = Array.from(nav.querySelectorAll("a, button")).map(
      (item) => item.textContent
    );
    expect(labels).toEqual(["Home", "Explore", "Write", "Notifications", "Profile"]);

    expect(screen.getByText("Home").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("Explore").closest("a")).toHaveAttribute("href", "/explore");
    expect(screen.getByText("Write").closest("a")).toHaveAttribute("href", "/write");
    expect(screen.getByText("Notifications").closest("a")).toHaveAttribute(
      "href",
      "/notifications"
    );
    expect(screen.getByText("Profile").closest("a")).toHaveAttribute("href", "/writer");
  });

  it("no longer offers the retired destinations", () => {
    render(<BottomNav username="writer" userId="user-1" />);
    for (const label of ["For you", "Discover", "Responses", "Record", "Messages"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("gates Write for guests and sends Notifications through sign-in", () => {
    render(<BottomNav username={null} userId={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      destination: "/write",
    });
    expect(screen.getByText("Notifications").closest("a")).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fnotifications"
    );
  });

  it("renders no mobile chrome on post pages", () => {
    navigationState.pathname = "/post/a-test-post";

    render(<BottomNav username="writer" userId="user-1" />);

    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" })
    ).not.toBeInTheDocument();
  });

  it("hides mobile navigation inside dedicated creation flows", () => {
    for (const pathname of ["/create/post", "/write"]) {
      navigationState.pathname = pathname;
      const { unmount } = render(<BottomNav username="writer" userId="user-1" />);
      expect(
        screen.queryByRole("navigation", { name: "Primary navigation" })
      ).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("BottomNav account label and safe areas", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("labels the account destination Join for a guest and Profile for a signed-in user", () => {
    const { rerender } = render(<BottomNav username={null} userId={null} />);
    expect(screen.getByText("Join")).toBeInTheDocument();
    expect(screen.queryByText("Profile")).not.toBeInTheDocument();

    rerender(<BottomNav username="writer" userId="user-1" />);
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.queryByText("Join")).not.toBeInTheDocument();
  });

  it("still routes the guest account destination to Join, not an authenticated route", () => {
    render(<BottomNav username={null} userId={null} />);

    expect(screen.getByText("Join").closest("a")).toHaveAttribute("href", "/signup");
  });

  it("pads the bar for the safe area and keeps every destination full height", () => {
    render(<BottomNav username="writer" userId="user-1" />);

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(nav.className).toMatch(/\bfixed\b/);
    expect(nav).toHaveStyle({ paddingBottom: "env(safe-area-inset-bottom)" });

    for (const label of ["Home", "Explore", "Write", "Notifications", "Profile"]) {
      const target = screen.getByText(label).closest("a, button");
      expect(target?.className).toMatch(/h-full/);
    }
  });

  it("keeps Profile selected throughout the signed-in account area", () => {
    for (const pathname of [
      "/me",
      "/writer",
      "/dashboard",
      "/bookmarks",
      "/settings",
    ]) {
      navigationState.pathname = pathname;
      const { unmount } = render(
        <BottomNav username="writer" userId="user-1" />
      );
      expect(screen.getByText("Profile").closest("a")).toHaveAttribute(
        "aria-current",
        "page"
      );
      unmount();
    }
  });
});

describe("BottomNav shared chrome contract", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("registers as the bottom composited chrome surface", () => {
    render(<BottomNav username="writer" userId="user-1" />);
    const bar = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(bar).toHaveAttribute("data-app-bottom-nav");
    expect(bar).toHaveAttribute("data-app-chrome-motion");
    expect(bar).toHaveClass("translate-y-0", "transition-transform");
  });
});
