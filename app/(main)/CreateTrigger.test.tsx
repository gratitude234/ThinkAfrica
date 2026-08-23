import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CreateTrigger from "./CreateTrigger";

const mocks = vi.hoisted(() => ({ requestAuth: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/components/ui/GuestAuthGateProvider", () => ({ useGuestAuthGate: () => ({ requestAuth: mocks.requestAuth }) }));

describe("CreateTrigger", () => {
  beforeEach(() => { mocks.requestAuth.mockReset(); mocks.push.mockReset(); });

  it("opens the universal canvas for a signed-in writer", () => {
    render(<CreateTrigger userId="user-1">Write</CreateTrigger>);
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(mocks.push).toHaveBeenCalledWith("/write");
  });

  it("uses the same destination after guest sign-in and preserves button props", () => {
    render(<CreateTrigger userId={null} className="cta" data-testid="cta">Write</CreateTrigger>);
    fireEvent.click(screen.getByTestId("cta"));
    expect(mocks.requestAuth).toHaveBeenCalledWith("create", { destination: "/write" });
    expect(screen.getByTestId("cta")).toHaveClass("cta");
  });
});
