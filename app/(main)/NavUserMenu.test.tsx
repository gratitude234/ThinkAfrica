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

const writer = { id: "user-1", email: "writer@example.com" } as User;

function menuLabels() {
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

describe("NavUserMenu", () => {
  beforeEach(() => {
    signOutState.signOut.mockReset();
    signOutState.signOut.mockResolvedValue(true);
    signOutState.isSigningOut = false;
    signOutState.error = null;
  });

  it("names the account and leaves Profile to the rail and the bottom bar", () => {
    render(
      <NavUserMenu
        user={writer}
        profile={{ username: "writer", full_name: "A Writer", avatar_url: null }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("A Writer")).toBeInTheDocument();
    expect(screen.getByText("@writer")).toBeInTheDocument();
    expect(menuLabels()).toEqual(["Bookmarks", "Settings", "Sign out"]);
    expect(screen.queryByText("Intellectual Record")).not.toBeInTheDocument();
    expect(screen.queryByText("Writing dashboard")).not.toBeInTheDocument();
  });

  it("shows no handle when the username cannot be used as a profile route", () => {
    render(
      <NavUserMenu
        user={writer}
        profile={{ username: "bad username", full_name: "A Writer", avatar_url: null }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
    expect(menuLabels()).toEqual(["Bookmarks", "Settings", "Sign out"]);
  });

  it("keeps the account actions and drops the editorial review queue", () => {
    render(
      <NavUserMenu
        user={writer}
        profile={{ username: "writer", full_name: "A Writer", avatar_url: null }}
        isAdmin
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.getByRole("menuitem", { name: "Bookmarks" })).toHaveAttribute(
      "href",
      "/bookmarks"
    );
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings"
    );
    expect(screen.getByRole("menuitem", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin"
    );
    expect(screen.queryByRole("menuitem", { name: "Review" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("offers Admin only to an admin", () => {
    render(
      <NavUserMenu
        user={writer}
        profile={{ username: "writer", full_name: "A Writer", avatar_url: null }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    expect(screen.queryByRole("menuitem", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("offers a guest sign in and sign up instead of a menu", () => {
    render(<NavUserMenu user={null} profile={null} />);

    expect(screen.queryByRole("button", { name: "Open account menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("href", "/signup");
  });

  it("closes on Escape", () => {
    render(
      <NavUserMenu
        user={writer}
        profile={{ username: "writer", full_name: "A Writer", avatar_url: null }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows pending and failed sign-out states inside the menu", () => {
    const props = {
      user: writer,
      profile: {
        username: "writer",
        full_name: "A Writer",
        avatar_url: null,
      },
    };
    const { rerender } = render(<NavUserMenu {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));

    signOutState.isSigningOut = true;
    rerender(<NavUserMenu {...props} />);
    expect(
      screen.getByRole("menuitem", { name: "Signing out…" })
    ).toBeDisabled();

    signOutState.isSigningOut = false;
    signOutState.error = "Unable to sign out.";
    rerender(<NavUserMenu {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to sign out."
    );
  });
});
