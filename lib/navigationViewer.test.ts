import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email?: string } },
  profile: null as null | Record<string, unknown>,
  tables: [] as string[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const { makeBuilder } = await import("@/lib/testUtils/supabaseMock");
  return {
    createClient: async () => ({
      auth: { getSession: async () => ({ data: { session: state.session } }) },
      from: (table: string) => {
        state.tables.push(table);
        return makeBuilder({ data: state.profile, error: null });
      },
    }),
  };
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
  AdminAccessError: class AdminAccessError extends Error {},
}));

import { getNavigationViewer } from "./navigationViewer";

describe("getNavigationViewer", () => {
  beforeEach(() => {
    state.session = null;
    state.profile = null;
    state.tables = [];
    vi.unstubAllEnvs();
  });

  it("reads nothing for a signed-out visitor", async () => {
    await expect(getNavigationViewer()).resolves.toEqual({ user: null, profile: null, isAdmin: false });
    expect(state.tables).toEqual([]);
  });

  it("reads one profile row for a member", async () => {
    state.session = { user: { id: "user-1", email: "ada@example.com" } };
    state.profile = { username: "ada", full_name: "Ada", role: "student", avatar_url: null };

    const viewer = await getNavigationViewer();

    expect(viewer.profile).toEqual(state.profile);
    expect(viewer.isAdmin).toBe(false);
    expect(state.tables).toEqual(["profiles"]);
  });

  it("recognises an admin by role", async () => {
    state.session = { user: { id: "user-1", email: "ada@example.com" } };
    state.profile = { username: "ada", full_name: "Ada", role: "admin", avatar_url: null };

    expect((await getNavigationViewer()).isAdmin).toBe(true);
  });

  it("recognises the bootstrap admin by email", async () => {
    vi.stubEnv("ADMIN_EMAIL", "ada@example.com");
    state.session = { user: { id: "user-1", email: "ada@example.com" } };
    state.profile = { username: "ada", full_name: "Ada", role: "student", avatar_url: null };

    expect((await getNavigationViewer()).isAdmin).toBe(true);
  });
});
