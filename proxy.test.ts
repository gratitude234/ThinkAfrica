import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
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
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
      from: vi.fn(() => query),
    };
  },
}));

function authenticatedRequest(url: string) {
  return new NextRequest(url, {
    headers: { cookie: "sb-test-auth-token=fake-session" },
  });
}

describe("home guest routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.single.mockResolvedValue({ data: { onboarding_completed: true }, error: null });
  });

  it("allows an unauthenticated explicit guest to read Home without touching Auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/?guest=1"));
    expect(response.status).toBe(200);
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated ordinary Home visit to Landing without touching Auth", async () => {
    const response = await proxy(new NextRequest("http://localhost/"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/landing");
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it("still sends an authenticated unfinished profile to onboarding", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({
      data: {
        user: { id: "user-1", email_confirmed_at: "2026-07-22T00:00:00Z" },
      },
      error: null,
    });
    mocks.single.mockResolvedValue({ data: { onboarding_completed: false }, error: null });

    const response = await proxy(authenticatedRequest("http://localhost/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/onboarding");
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});

describe("session refresh boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
  });

  it("validates an authenticated dynamic API request in proxy without calling getUser", async () => {
    const response = await proxy(authenticatedRequest("http://localhost/api/feed"));

    expect(response.status).toBe(200);
    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("does not turn a transient auth outage into a false logout", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: { name: "AuthRetryableFetchError", status: 0, message: "network" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await proxy(authenticatedRequest("http://localhost/api/feed"));

    expect(response.status).toBe(200);
    warn.mockRestore();
  });

  it("treats concurrent refresh 409s as transient instead of logging the user out", async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: null },
      error: {
        name: "AuthApiError",
        status: 409,
        message: "Too many concurrent token refresh requests on the same session or refresh token",
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await proxy(authenticatedRequest("http://localhost/dashboard"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    warn.mockRestore();
  });
});

describe("guest redirect preserves the full intended destination (Pass 3: Response Creation UX)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves a response's parent id and format on the Article composer", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/write?inResponseTo=post-1&kind=article")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirectTo=%2Fwrite%3FinResponseTo%3Dpost-1%26kind%3Darticle"
    );
    expect(mocks.getClaims).not.toHaveBeenCalled();
  });

  it("preserves a response's parent id on the Post composer", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/create/post?inResponseTo=post-1")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirectTo=%2Fcreate%2Fpost%3FinResponseTo%3Dpost-1"
    );
  });

  it("does not leak the original query string onto /login as top-level params", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/write?inResponseTo=post-1&kind=article")
    );

    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("inResponseTo")).toBeNull();
    expect(location.searchParams.get("kind")).toBeNull();
    expect(location.searchParams.get("redirectTo")).toBe(
      "/write?inResponseTo=post-1&kind=article"
    );
  });

  it("still redirects to a bare pathname when there is no query string to preserve", async () => {
    const response = await proxy(new NextRequest("http://localhost/dashboard"));

    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirectTo=%2Fdashboard"
    );
  });
});
