import type { AnchorHTMLAttributes } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FeaturedWork from "./FeaturedWork";

vi.mock("next/navigation", () => ({
  usePathname: () => "/someone",
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

describe("FeaturedWork 'Publish work' CTA (generic, empty-state, own profile)", () => {
  it("opens the shared Create chooser instead of linking straight to /write", () => {
    render(<FeaturedWork posts={[]} isOwnProfile currentUserId="user-1" />);

    const trigger = screen.getByRole("button", { name: "Publish work" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^Post/);
    expect(links[1]).toHaveAccessibleName(/^Article/);
    expect(links[2]).toHaveAccessibleName(/^Research Paper/);
  });

  it("does not render a plain link straight to /write", () => {
    render(<FeaturedWork posts={[]} isOwnProfile currentUserId="user-1" />);

    expect(screen.queryByRole("link", { name: "Publish work" })).not.toBeInTheDocument();
  });

  it("does not show the Publish CTA on someone else's profile", () => {
    render(<FeaturedWork posts={[]} isOwnProfile={false} profileName="Jane" />);

    expect(screen.queryByRole("button", { name: "Publish work" })).not.toBeInTheDocument();
  });
});
