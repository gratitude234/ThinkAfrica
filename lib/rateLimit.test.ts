import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkRateLimit, clientAddress, resetRateLimits } = await import(
  "@/lib/rateLimit"
);

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit and refuses the next one", () => {
    const options = { limit: 3, windowMs: 60_000 };
    const now = 1_000_000;

    expect(checkRateLimit("k", options, now).allowed).toBe(true);
    expect(checkRateLimit("k", options, now).allowed).toBe(true);
    expect(checkRateLimit("k", options, now).allowed).toBe(true);

    const refused = checkRateLimit("k", options, now);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
  });

  it("counts each key separately", () => {
    const options = { limit: 1, windowMs: 60_000 };
    const now = 1_000_000;

    expect(checkRateLimit("a", options, now).allowed).toBe(true);
    expect(checkRateLimit("b", options, now).allowed).toBe(true);
    expect(checkRateLimit("a", options, now).allowed).toBe(false);
  });

  it("starts a fresh window once the old one has passed", () => {
    const options = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit("k", options, 0).allowed).toBe(true);
    expect(checkRateLimit("k", options, 59_999).allowed).toBe(false);
    expect(checkRateLimit("k", options, 60_000).allowed).toBe(true);
  });

  it("reports how long the caller has to wait", () => {
    const options = { limit: 1, windowMs: 60_000 };
    checkRateLimit("k", options, 0);
    expect(checkRateLimit("k", options, 30_000).retryAfterSeconds).toBe(30);
  });

  it("never reports a retry of zero seconds, which would invite an instant retry", () => {
    const options = { limit: 1, windowMs: 1000 };
    checkRateLimit("k", options, 0);
    expect(checkRateLimit("k", options, 999).retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});

describe("clientAddress", () => {
  it("takes the client-facing entry from x-forwarded-for", () => {
    // The header is a list appended to by each proxy, so the first entry is
    // the one closest to the client.
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" });
    expect(clientAddress(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4"
    );
    // Everything with no address shares one bucket. That is deliberate: it is
    // more restrictive than handing each unidentifiable caller its own quota.
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
