import { cleanup, render, screen } from "@testing-library/react";
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

  it("shows the compose FAB to guests and redirects them through login", () => {
    render(
      <BottomNav username={null} userId={null} hasActiveDebate={false} />
    );

    expect(screen.getByRole("link", { name: "Start writing" })).toHaveAttribute(
      "href",
      "/login?redirectTo=%2Fwrite"
    );
  });

  it("keeps the compose FAB on post pages while hiding the regular bottom nav", () => {
    navigationState.pathname = "/post/a-test-post";

    render(
      <BottomNav username="writer" userId="user-1" hasActiveDebate={false} />
    );

    expect(screen.getByRole("link", { name: "Start writing" })).toHaveAttribute(
      "href",
      "/write"
    );
    expect(
      screen.queryByRole("navigation", { name: "Primary navigation" })
    ).not.toBeInTheDocument();
  });
});
