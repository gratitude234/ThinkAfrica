import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MePage from "./page";

type TestUser = { id: string; email: string | null };
type TestProfile = {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  points: number | null;
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
  points: 125,
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

  it("renders identity, points, and standard account destinations", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { name: "A Writer" })).toBeInTheDocument();
    expect(screen.getByText("125 pts")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View public profile" })
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

  it("offers profile completion when the username is unusable", async () => {
    state.profile = { ...standardProfile, username: "bad username" };

    await renderPage();

    expect(
      screen.getByRole("link", { name: "Complete profile" })
    ).toHaveAttribute("href", "/settings");
    expect(screen.getByText("writer@example.com")).toBeInTheDocument();
  });

  it("shows Review to reviewers without exposing Admin", async () => {
    state.profile = { ...standardProfile, role: "reviewer" };

    await renderPage();

    expect(screen.getByRole("link", { name: /Review/ })).toHaveAttribute(
      "href",
      "/review"
    );
    expect(screen.queryByRole("link", { name: /Admin/ })).not.toBeInTheDocument();
  });

  it("shows both Review and Admin to editors", async () => {
    state.profile = { ...standardProfile, role: "editor" };

    await renderPage();

    expect(screen.getByRole("link", { name: /Review/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Admin/ })).toHaveAttribute(
      "href",
      "/admin"
    );
  });

  it("honors bootstrap admin access without granting reviewer access", async () => {
    state.user = { id: "user-1", email: "bootstrap@example.com" };

    await renderPage();

    expect(screen.getByRole("link", { name: /Admin/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Review/ })).not.toBeInTheDocument();
  });
});
