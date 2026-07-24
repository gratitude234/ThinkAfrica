import type { AnchorHTMLAttributes } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CollaborationDashboardCard from "./CollaborationDashboardCard";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: mocks.push }),
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
  it("navigates straight to the Post composer instead of linking to /write", () => {
    render(
      <CollaborationDashboardCard
        userId="user-1"
        pendingInvites={[]}
        recentResponses={[]}
        unreadMessageCount={0}
        suggestions={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Start writing" }));

    expect(mocks.push).toHaveBeenCalledWith("/create/post");
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
