import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Home was where a member landed after signing in, and where a slow Auth
 * server signed them out again: a claim check that timed out read as a
 * visitor, and a visitor is sent to /landing.
 */

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("./PostsFeedSection", () => ({ default: () => null }));
vi.mock("@/components/post/FeedSkeleton", () => ({ default: () => null }));
vi.mock("@/components/retention/RetentionEventTracker", () => ({ default: () => null }));

import { AuthUnavailableError } from "@/lib/supabase/authFailure";
import HomePage from "./page";

function visit(searchParams: Record<string, string> = {}) {
  return HomePage({ searchParams: Promise.resolve(searchParams) });
}

describe("Home and the session check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the feed for a signed-in member", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    await expect(visit()).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sends a visitor with no session to Landing", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    await expect(visit()).rejects.toThrow("NEXT_REDIRECT /landing");
  });

  it("does not send a member to Landing because the signing keys did not arrive", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: {
        name: "AuthRetryableFetchError",
        status: 0,
        message: "Supabase did not respond within 8000ms. The request was abandoned rather than held open.",
      },
    });
    await expect(visit()).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still treats a token Auth rejected as signed out", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: { name: "AuthInvalidJwtError", status: 400, message: "Invalid JWT signature" },
    });
    await expect(visit()).rejects.toThrow("NEXT_REDIRECT /landing");
  });
});
