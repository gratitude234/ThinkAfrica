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

    const trigger = screen.getByRole("button", { name: "Publish a contribution" });
    expect(screen.queryByRole("link", { name: "Publish a contribution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders no mobile chrome on post pages, FAB included", () => {
    navigationState.pathname = "/post/a-test-post";

    render(
      <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
    );

    // The post page floats its own ReadingBar, whose Respond writes a reply to
    // the piece being read. The compose FAB opened a blank /create/post from
    // 40px away, so the corner offered two writing controls and the more
    // prominent one led away from the article.
    expect(
      screen.queryByRole("button", { name: "Publish a contribution" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" })
    ).not.toBeInTheDocument();
  });

  it("hides mobile navigation inside dedicated creation flows", () => {
    navigationState.pathname = "/create/post";

    render(
      <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
    );

    expect(screen.queryByRole("button", { name: "Publish a contribution" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });
});

describe("BottomNav account label and safe areas", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("labels the account destination Join for a guest and Record for a signed-in user", () => {
    const { rerender } = render(
      <BottomNav username={null} userId={null} hasActiveDebate={false} />
    );
    expect(screen.getByText("Join")).toBeInTheDocument();
    expect(screen.queryByText("Record")).not.toBeInTheDocument();

    rerender(<BottomNav username="writer" userId="user-1" hasActiveDebate={false} />);
    expect(screen.getByText("Record")).toBeInTheDocument();
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

    for (const label of ["For you", "Discover", "Debates", "Responses", "Record"]) {
      const link = screen.getByText(label).closest("a");
      expect(link?.className).toMatch(/h-full/);
    }
  });

  it("keeps Record selected throughout the signed-in account area", () => {
    for (const pathname of [
      "/me",
      "/writer",
      "/dashboard",
      "/bookmarks",
      "/settings",
    ]) {
      navigationState.pathname = pathname;
      const { unmount } = render(
        <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
      );
      expect(screen.getByText("Record").closest("a")).toHaveAttribute(
        "aria-current",
        "page"
      );
      unmount();
    }
  });
});

describe("BottomNav debates destination", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
    mocks.requestAuth.mockReset();
  });

  afterEach(() => cleanup());

  it("gives mobile users a route into debates", () => {
    render(<BottomNav username="writer" userId="user-1" hasActiveDebate={false} />);

    expect(screen.getByText("Debates").closest("a")).toHaveAttribute(
      "href",
      "/debates"
    );
  });

  it("announces a live debate only while one is running", () => {
    const { rerender } = render(
      <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
    );
    expect(screen.queryByText("A debate is live now")).not.toBeInTheDocument();

    rerender(
      <BottomNav username="writer" userId="user-1" hasActiveDebate />
    );
    expect(screen.getByText("A debate is live now")).toBeInTheDocument();
  });

  it("marks the debates tab as the current page inside a debate room", () => {
    navigationState.pathname = "/debates/some-debate-id";

    render(<BottomNav username="writer" userId="user-1" hasActiveDebate />);

    expect(screen.getByText("Debates").closest("a")).toHaveAttribute(
      "aria-current",
      "page"
    );
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
    render(<BottomNav username="writer" userId="user-1" hasActiveDebate={false} />);
    const bar = screen.getByRole("navigation", { name: "Primary navigation" });
    expect(bar).toHaveAttribute("data-app-bottom-nav");
    expect(bar).toHaveAttribute("data-app-chrome-motion");
    expect(bar).toHaveClass("translate-y-0", "transition-transform");
  });
});
