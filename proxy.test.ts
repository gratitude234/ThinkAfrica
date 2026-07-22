import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: mocks.single,
    };
    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => query),
    };
  },
}));

describe("home guest routing", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.single.mockReset();
  });

  it("allows an unauthenticated explicit guest to read Home", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(new NextRequest("http://localhost/?guest=1"));
    expect(response.status).toBe(200);
  });

  it("redirects an unauthenticated ordinary Home visit to Landing", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await proxy(new NextRequest("http://localhost/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/landing");
  });

  it("still sends an authenticated unfinished profile to onboarding", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email_confirmed_at: "2026-07-22T00:00:00Z" } },
    });
    mocks.single.mockResolvedValue({ data: { onboarding_completed: false } });
    const response = await proxy(new NextRequest("http://localhost/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/onboarding");
  });
});
