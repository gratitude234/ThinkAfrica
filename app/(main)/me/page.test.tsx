import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MePage from "./page";

type TestUser = { id: string; email: string | null };
type TestProfile = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "student" | "reviewer" | "editor" | "admin" | null;
};

const state = vi.hoisted(() => ({
  user: null as TestUser | null,
  profile: null as TestProfile | null,
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: state.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.profile }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/components/ui/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span>{name} avatar</span>,
}));

const standardProfile: TestProfile = {
  username: "writer",
  full_name: "A Writer",
  avatar_url: null,
  role: "student",
};

async function renderPage() {
  render(await MePage());
}

describe("MePage", () => {
  beforeEach(() => {
    state.user = { id: "user-1", email: "writer@example.com" };
    state.profile = { ...standardProfile };
    state.redirect.mockClear();
    vi.stubEnv("ADMIN_EMAIL", "bootstrap@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends guests to login and preserves the intended destination", async () => {
    state.user = null;

    await expect(MePage()).rejects.toThrow(
      "REDIRECT:/login?redirectTo=/me"
    );
    expect(state.redirect).toHaveBeenCalledWith(
      "/login?redirectTo=/me"
    );
  });

  it("sends accounts without a profile record to Settings", async () => {
    state.profile = null;

    await expect(MePage()).rejects.toThrow("REDIRECT:/settings");
    expect(state.redirect).toHaveBeenCalledWith("/settings");
  });

  it("renders the profile entry and standard account destinations", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "A Writer" })).toBeInTheDocument();
    expect(screen.queryByText(/Intellectual Record/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View profile" })
    ).toHaveAttribute("href", "/writer");
    expect(screen.getByRole("link", { name: /My writing/ })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(screen.getByRole("link", { name: /Bookmarks/ })).toHaveAttribute(
      "href",
      "/bookmarks"
    );
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute(
      "href",
      "/settings"
    );
    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin/ })).not.toBeInTheDocument();
  });

  it("sends a member with an unusable username to Edit profile, with no completion prompt", async () => {
    state.profile = { ...standardProfile, username: "bad username" };

    await renderPage();

    expect(
      screen.getByRole("link", { name: "Edit profile" })
    ).toHaveAttribute("href", "/settings/profile");
    expect(screen.queryByText(/Complete profile/)).not.toBeInTheDocument();
    expect(screen.getByText("writer@example.com")).toBeInTheDocument();
  });

  it("offers reviewers no Review link, because editorial review is retired", async () => {
    state.profile = { ...standardProfile, role: "reviewer" };

    await renderPage();

    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin/ })).not.toBeInTheDocument();
  });

  it("shows editors neither Admin nor Review, now the Featured Posts tool is retired", async () => {
    // Featured Posts was the only admin area an editor could open. Phase 2F
    // removed it, so the hub would have nothing to show them.
    state.profile = { ...standardProfile, role: "editor" };

    await renderPage();

    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin/ })).not.toBeInTheDocument();
  });

  it("honors bootstrap admin access without granting reviewer access", async () => {
    state.user = { id: "user-1", email: "bootstrap@example.com" };

    await renderPage();

    expect(screen.getByRole("link", { name: /Admin/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
  });
});
