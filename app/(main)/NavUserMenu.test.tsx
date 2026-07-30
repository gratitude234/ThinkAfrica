import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import NavUserMenu from "./NavUserMenu";

const signOutState = vi.hoisted(() => ({
  signOut: vi.fn(),
  isSigningOut: false,
  error: null as string | null,
}));

vi.mock("@/lib/useSignOut", () => ({
  useSignOut: () => signOutState,
}));

describe("NavUserMenu profile destination", () => {
  beforeEach(() => {
    signOutState.signOut.mockReset();
    signOutState.signOut.mockResolvedValue(true);
    signOutState.isSigningOut = false;
    signOutState.error = null;
  });

  it("links directly to the public profile when a usable username exists", () => {
    render(
      <NavUserMenu
        user={{ id: "user-1", email: "writer@example.com" } as User}
        profile={{
          username: "writer",
          full_name: "A Writer",
          avatar_url: null,
        }}
        points={25}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/writer"
    );
  });

  it("falls back to Settings when the username cannot be used as a profile route", () => {
    render(
      <NavUserMenu
        user={{ id: "user-1", email: "writer@example.com" } as User}
        profile={{
          username: "bad username",
          full_name: "A Writer",
          avatar_url: null,
        }}
        points={25}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/settings"
    );
  });

  it("shows pending and failed sign-out states inside the menu", () => {
    const props = {
      user: { id: "user-1", email: "writer@example.com" } as User,
      profile: {
        username: "writer",
        full_name: "A Writer",
        avatar_url: null,
      },
      points: 25,
    };
    const { rerender } = render(<NavUserMenu {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    signOutState.isSigningOut = true;
    rerender(<NavUserMenu {...props} />);
    expect(
      screen.getByRole("button", { name: "Signing out…" })
    ).toBeDisabled();

    signOutState.isSigningOut = false;
    signOutState.error = "Unable to sign out.";
    rerender(<NavUserMenu {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to sign out."
    );
  });
});
