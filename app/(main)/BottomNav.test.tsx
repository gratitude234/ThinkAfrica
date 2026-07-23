import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));
const mocks = vi.hoisted(() => ({ requestAuth: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

// Real MessagesUnreadBadge instantiates a Supabase browser client, which
// needs live project env vars this test environment doesn't have -- it's
// unrelated to what these tests assert on (labels, hrefs, safe-area/touch
// target classes), so it's stubbed out like any other unrelated dependency.
vi.mock("@/components/ui/MessagesUnreadBadge", () => ({
  default: () => null,
}));

describe("BottomNav compose access", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("shows the compose FAB to guests and opens the contextual sign-in gate instead of the create chooser", () => {
    render(
      <BottomNav username={null} userId={null} hasActiveDebate={false} />
    );

    const trigger = screen.getByRole("button", { name: "Start writing" });
    expect(screen.queryByRole("link", { name: "Start writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the compose FAB on post pages while hiding the regular bottom nav", () => {
    navigationState.pathname = "/post/a-test-post";

    render(
      <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
    );

    expect(screen.getByRole("button", { name: "Start writing" })).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" })
    ).not.toBeInTheDocument();
  });

  it("hides mobile navigation inside dedicated creation flows", () => {
    navigationState.pathname = "/create/post";

    render(
      <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
    );

    expect(screen.queryByRole("button", { name: "Start writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });
});

describe("BottomNav account label and safe areas", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("labels the account destination Join for a guest and Me for a signed-in user", () => {
    const { rerender } = render(
      <BottomNav username={null} userId={null} hasActiveDebate={false} />
    );
    expect(screen.getByText("Join")).toBeInTheDocument();
    expect(screen.queryByText("Me")).not.toBeInTheDocument();

    rerender(<BottomNav username="writer" userId="user-1" hasActiveDebate={false} />);
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.queryByText("Join")).not.toBeInTheDocument();
  });

  it("still routes the guest account destination to Join, not the authenticated profile route", () => {
    render(<BottomNav username={null} userId={null} hasActiveDebate={false} />);

    expect(screen.getByText("Join").closest("a")).toHaveAttribute("href", "/signup");
  });

  it("pads the bar for the safe area and keeps every nav destination at least 44px tall", () => {
    render(<BottomNav username="writer" userId="user-1" hasActiveDebate={false} />);

    const nav = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(nav.className).toMatch(/\bfixed\b/);
    expect(nav).toHaveStyle({ paddingBottom: "env(safe-area-inset-bottom)" });

    for (const label of ["Home", "Explore", "Messages", "Me"]) {
      const link = screen.getByText(label).closest("a");
      expect(link?.className).toMatch(/h-full/);
    }
  });
});
