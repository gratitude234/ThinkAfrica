import type { AnchorHTMLAttributes } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

vi.mock("next/navigation", () => ({
  usePathname: () => "/landing",
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
  it("opens the shared Create chooser instead of linking straight to /write", () => {
    render(<Footer landing />);

    const trigger = screen.getByRole("button", { name: "Write" });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Create" });
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^Post/);
    expect(links[1]).toHaveAccessibleName(/^Article/);
    expect(links[2]).toHaveAccessibleName(/^Research Paper/);
  });

  it("does not render a plain link straight to /write", () => {
    render(<Footer landing />);

    expect(screen.queryByRole("link", { name: "Write" })).not.toBeInTheDocument();
  });
});
