import type { AnchorHTMLAttributes } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PortfolioProgressCard from "./PortfolioProgressCard";

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

const items = [
  { key: "published", label: "Published", value: 2, helper: "helper", done: true },
];

describe("PortfolioProgressCard next-action CTA", () => {
  it("navigates the generic 'Write next piece' nudge straight to the Post composer", () => {
    render(
      <PortfolioProgressCard
        items={items}
        userId="user-1"
        nextAction={{
          label: "Keep building portfolio proof",
          body: "Add another source-backed or co-authored piece.",
          href: "/write",
          cta: "Write next piece",
          openChooser: true,
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Write next piece" }));

    expect(mocks.push).toHaveBeenCalledWith("/create/post");
  });

  it("keeps a content-specific next action (e.g. 'Manage profile') as a direct link, bypassing the chooser", () => {
    render(
      <PortfolioProgressCard
        items={items}
        userId="user-1"
        nextAction={{
          label: "Feature your citable work",
          body: "Put your strongest archived or citable piece near the top of your profile.",
          href: "/settings",
          cta: "Manage profile",
        }}
      />
    );

    const link = screen.getByRole("link", { name: "Manage profile" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
