import type { AnchorHTMLAttributes } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PortfolioProgressCard from "./PortfolioProgressCard";

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

const items = [
  { key: "published", label: "Published", value: 2, helper: "helper", done: true },
];

describe("PortfolioProgressCard next-action CTA", () => {
  it("opens the shared Create chooser for the generic 'Write next piece' nudge", () => {
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

    const trigger = screen.getByRole("button", { name: "Write next piece" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^Post/);
    expect(links[1]).toHaveAccessibleName(/^Article/);
    expect(links[2]).toHaveAccessibleName(/^Research Paper/);
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
