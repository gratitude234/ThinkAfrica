import type { AnchorHTMLAttributes } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CollaborationDashboardCard from "./CollaborationDashboardCard";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

describe("CollaborationDashboardCard 'Start writing' CTA (generic, empty-state)", () => {
  it("opens the shared Create chooser instead of linking straight to /write", () => {
    render(
      <CollaborationDashboardCard
        userId="user-1"
        pendingInvites={[]}
        recentResponses={[]}
        unreadMessageCount={0}
        suggestions={[]}
      />
    );

    const trigger = screen.getByRole("button", { name: "Start writing" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^Post/);
    expect(links[1]).toHaveAccessibleName(/^Article/);
    expect(links[2]).toHaveAccessibleName(/^Research Paper/);
  });

  it("does not render a plain link straight to /write", () => {
    render(
      <CollaborationDashboardCard
        userId="user-1"
        pendingInvites={[]}
        recentResponses={[]}
        unreadMessageCount={0}
        suggestions={[]}
      />
    );

    expect(screen.queryByRole("link", { name: "Start writing" })).not.toBeInTheDocument();
  });
});
