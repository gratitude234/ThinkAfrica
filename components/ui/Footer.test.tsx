import type { AnchorHTMLAttributes } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/landing",
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
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

describe("Footer 'Write' link (generic creation CTA)", () => {
  it("opens the contextual sign-in gate instead of the chooser, since Footer's only caller (landing) is guest-only", () => {
    render(<Footer landing />);

    const trigger = screen.getByRole("button", { name: "Write" });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render a plain link straight to /write", () => {
    render(<Footer landing />);

    expect(screen.queryByRole("link", { name: "Write" })).not.toBeInTheDocument();
  });
});
