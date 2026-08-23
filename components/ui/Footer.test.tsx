import type { AnchorHTMLAttributes } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Footer from "./Footer";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/landing",
  useRouter: () => ({ push: vi.fn() }),
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
  beforeEach(() => mocks.requestAuth.mockReset());

  it("gates the universal composer directly", () => {
    render(<Footer landing />);

    const trigger = screen.getByRole("button", { name: "Write" });
    fireEvent.click(trigger);

    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      destination: "/write",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves the universal destination through sign-in", () => {
    render(<Footer landing />);

    fireEvent.click(screen.getByRole("button", { name: "Write" }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      destination: "/write",
    });
  });

  it("does not render a plain link straight to /write", () => {
    render(<Footer landing />);

    expect(screen.queryByRole("link", { name: "Write" })).not.toBeInTheDocument();
  });
});
