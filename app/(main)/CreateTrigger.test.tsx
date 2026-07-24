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
// direct-to-composer behavior without re-implementing it.
describe("CreateTrigger -- reusable outside navigation", () => {
  beforeEach(() => {
    mocks.requestAuth.mockReset();
    mocks.push.mockReset();
  });

  afterEach(() => cleanup());

  it("navigates a signed-in user straight to the Post composer with no chooser dialog", () => {
    render(
      <CreateTrigger userId="user-1" className="footer-write-cta">
        Write
      </CreateTrigger>
    );

    fireEvent.click(screen.getByRole("button", { name: "Write" }));

    expect(mocks.push).toHaveBeenCalledWith("/create/post");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the contextual sign-in gate for a guest instead of navigating", () => {
    render(<CreateTrigger userId={null}>Write</CreateTrigger>);

    fireEvent.click(screen.getByRole("button", { name: "Write" }));

    expect(mocks.requestAuth).toHaveBeenCalledWith("create");
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
