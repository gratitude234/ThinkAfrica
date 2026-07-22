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

describe("guest redirect preserves the full intended destination (Pass 3: Response Creation UX)", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
  });

  it("preserves a response's parent id and format on the Article (Long-form response) composer", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(
      new NextRequest("http://localhost/write?inResponseTo=post-1&kind=article")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirectTo=%2Fwrite%3FinResponseTo%3Dpost-1%26kind%3Darticle"
    );
  });

  it("preserves a response's parent id on the Post (Quick response) composer", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(
      new NextRequest("http://localhost/create/post?inResponseTo=post-1")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirectTo=%2Fcreate%2Fpost%3FinResponseTo%3Dpost-1"
    );
  });

  it("does not leak the original query string onto /login as top-level params", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(
      new NextRequest("http://localhost/write?inResponseTo=post-1&kind=article")
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("inResponseTo")).toBeNull();
    expect(location.searchParams.get("kind")).toBeNull();
    expect(location.searchParams.get("redirectTo")).toBe("/write?inResponseTo=post-1&kind=article");
  });

  it("still redirects to a bare pathname when there is no query string to preserve", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(new NextRequest("http://localhost/dashboard"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirectTo=%2Fdashboard"
    );
  });
});
