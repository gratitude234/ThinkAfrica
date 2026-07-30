import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountForm from "./AccountForm";

const signOutState = vi.hoisted(() => ({
  signOut: vi.fn(),
  isSigningOut: false,
  error: null as string | null,
}));

vi.mock("@/lib/useSignOut", () => ({
  useSignOut: () => signOutState,
}));

vi.mock("@/app/(auth)/accountEmailActions", () => ({
  sendPasswordChangedEmail: vi.fn(),
}));

describe("AccountForm session controls", () => {
  beforeEach(() => {
    signOutState.signOut.mockReset();
    signOutState.isSigningOut = false;
    signOutState.error = null;
  });

  it("offers sign out from Account & Security", () => {
    render(<AccountForm email="writer@example.com" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutState.signOut).toHaveBeenCalledOnce();
    expect(screen.getByText("Session")).toBeInTheDocument();
  });

  it("shows the busy and failure states", () => {
    const { rerender } = render(<AccountForm email="writer@example.com" />);

    signOutState.isSigningOut = true;
    rerender(<AccountForm email="writer@example.com" />);
    expect(
      screen.getByRole("button", { name: "Signing out…" })
    ).toBeDisabled();

    signOutState.isSigningOut = false;
    signOutState.error = "Unable to sign out.";
    rerender(<AccountForm email="writer@example.com" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to sign out."
    );
  });
});
