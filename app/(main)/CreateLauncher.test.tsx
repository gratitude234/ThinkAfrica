import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateLauncher from "./CreateLauncher";

const requestAuth = vi.fn();
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth }),
}));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

describe("CreateLauncher", () => {
  beforeEach(() => requestAuth.mockReset());

  it("takes a signed-in writer directly to the universal canvas", () => {
    render(<CreateLauncher userId="user-1" />);
    expect(screen.getByRole("link", { name: "Contribute" })).toHaveAttribute("href", "/write");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gates a guest while preserving the one universal destination", () => {
    render(<CreateLauncher userId={null} variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Contribute" }));
    expect(requestAuth).toHaveBeenCalledWith("create", { destination: "/write" });
  });

  it("uses the same md breakpoint for desktop and mobile controls", () => {
    const { rerender } = render(<CreateLauncher userId="user-1" />);
    expect(screen.getByRole("link", { name: "Contribute" })).toHaveClass("hidden", "md:inline-flex");
    rerender(<CreateLauncher userId="user-1" variant="mobileFab" />);
    expect(screen.getByRole("link", { name: "Contribute" })).toHaveClass("md:hidden");
  });
});
