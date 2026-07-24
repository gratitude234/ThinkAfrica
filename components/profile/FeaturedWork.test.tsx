import type { AnchorHTMLAttributes } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import FeaturedWork from "./FeaturedWork";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/someone",
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

describe("FeaturedWork 'Publish work' CTA (generic, empty-state, own profile)", () => {
  it("navigates straight to the Post composer instead of linking to /write", () => {
    render(<FeaturedWork posts={[]} isOwnProfile currentUserId="user-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Publish work" }));

    expect(mocks.push).toHaveBeenCalledWith("/create/post");
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
