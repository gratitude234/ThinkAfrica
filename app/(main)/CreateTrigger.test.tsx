import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateTrigger from "./CreateTrigger";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/ui/GuestAuthGateProvider", () => ({
  useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }),
}));

// These tests stand in for an ad-hoc CTA (Footer "Write", a dashboard
// "Start writing" button, ...) that has nothing to do with NavClient or
// BottomNav -- proving every ambiguous Create entry point shares the same
// contribution-format behavior without re-implementing it.
describe("CreateTrigger -- reusable contribution chooser", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    mocks.push.mockReset();
  });

  afterEach(() => cleanup());

  it("opens the same chooser for a signed-in user", () => {
    render(
      <CreateTrigger userId="user-1" className="footer-write-cta">
        Write
      </CreateTrigger>
    );

    fireEvent.click(screen.getByRole("button", { name: "Write" }));

    expect(screen.getByRole("dialog", { name: "Create a contribution" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Post/ })).toHaveAttribute("href", "/create/post");
  });

  it("preserves a guest's selected format through sign-in", () => {
    render(<CreateTrigger userId={null}>Write</CreateTrigger>);

    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    fireEvent.click(screen.getByRole("button", { name: /^Research/ }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create", {
      contentKind: "research",
      destination: "/submit/research",
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("passes through className and arbitrary button attributes", () => {
    render(
      <CreateTrigger userId="user-1" className="dashboard-cta" data-testid="new-cta">
        + New
      </CreateTrigger>
    );

    const trigger = screen.getByTestId("new-cta");
    expect(trigger).toHaveClass("dashboard-cta");
    expect(trigger).toHaveAttribute("type", "button");
  });
});
