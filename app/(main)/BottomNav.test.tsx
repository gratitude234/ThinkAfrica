import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BottomNav from "./BottomNav";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

describe("BottomNav compose access", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  afterEach(() => cleanup());

  it("shows the compose FAB to guests and opens the create chooser instead of navigating directly", () => {
    render(
      <BottomNav username={null} userId={null} hasActiveDebate={false} />
    );

    const trigger = screen.getByRole("button", { name: "Start writing" });
    expect(screen.queryByRole("link", { name: "Start writing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create" });
    expect(within(dialog).getByRole("link", { name: /^Post/ })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fcreate%2Fpost"
    );
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
});
