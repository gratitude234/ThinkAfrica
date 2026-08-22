import type { AnchorHTMLAttributes } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

  it("opens the shared contribution chooser rather than assuming a format", () => {
    render(<Footer landing />);

    const trigger = screen.getByRole("button", { name: "Write" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Create a contribution" })
    ).toBeInTheDocument();
    expect(mocks.requestAuth).not.toHaveBeenCalled();
  });

  it("records the format a guest picked so sign-in can return them to it", () => {
    render(<Footer landing />);

    fireEvent.click(screen.getByRole("button", { name: "Write" }));

    const dialog = screen.getByRole("dialog", { name: "Create a contribution" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Article/ }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      contentKind: "article",
      destination: "/write?kind=article",
    });
  });

  it("does not render a plain link straight to /write", () => {
    render(<Footer landing />);

    expect(screen.queryByRole("link", { name: "Write" })).not.toBeInTheDocument();
  });
});
