import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NavClient from "./NavClient";

const navigationState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/components/ui/BrandWordmark", () => ({
  default: () => <span>Indegenius</span>,
}));

vi.mock("./NavUserMenu", () => ({
  default: () => <span>Account menu</span>,
}));

vi.mock("./CreateLauncher", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/NotificationBell", () => ({
  default: () => <button type="button">Notifications</button>,
}));

vi.mock("@/components/ui/MessagesUnreadBadge", () => ({
  default: () => null,
}));

describe("NavClient mobile Messages visibility", () => {
  beforeEach(() => {
    navigationState.pathname = "/";
  });

  it("hides the shortcut on mobile when the bottom navigation is present", () => {
    render(
      <NavClient
        user={null}
        profile={null}
        isAdmin={false}
        canAccessReview={false}
        onOpenSearch={vi.fn()}
      />
    );

    const messages = screen.getByRole("link", { name: "Open messages" });
    expect(messages).toHaveClass("hidden");
    expect(messages).toHaveClass("md:flex");
    expect(
      screen.queryByRole("button", { name: "Open more menu" })
    ).not.toBeInTheDocument();
  });

  it("shows the shortcut on mobile when a post hides the bottom navigation", () => {
    navigationState.pathname = "/post/a-published-piece";

    render(
      <NavClient
        user={null}
        profile={null}
        isAdmin={false}
        canAccessReview={false}
        onOpenSearch={vi.fn()}
      />
    );

    const messages = screen.getByRole("link", { name: "Open messages" });
    expect(messages).toHaveClass("flex");
    expect(messages).not.toHaveClass("hidden");
  });
});
