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
    expect(screen.getByRole("link", { name: "Publish" })).toHaveAttribute("href", "/write");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gates a guest while preserving the one universal destination", () => {
    render(<CreateLauncher userId={null} variant="mobileFab" />);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(requestAuth).toHaveBeenCalledWith("create", { destination: "/write" });
  });

  it("lifts the FAB clear of the profile sticky bar", () => {
    // The bar is fixed to this same corner and paints below the FAB, so
    // without this term the FAB covered its Follow button and ate the taps.
    // The variable resolves to 0px on every other screen.
    render(<CreateLauncher userId="user-1" variant="mobileFab" />);
    const bottom = screen.getByRole("link", { name: "Publish" }).style.bottom;
    expect(bottom).toContain("var(--profile-sticky-bar-height, 0px)");
    expect(bottom).toContain("env(safe-area-inset-bottom)");
  });

  it("uses the same md breakpoint for desktop and mobile controls", () => {
    const { rerender } = render(<CreateLauncher userId="user-1" />);
    expect(screen.getByRole("link", { name: "Publish" })).toHaveClass("hidden", "md:inline-flex");
    rerender(<CreateLauncher userId="user-1" variant="mobileFab" />);
    expect(screen.getByRole("link", { name: "Publish" })).toHaveClass("md:hidden");
  });
});
