import { describe, expect, it } from "vitest";
import { getCronAuthorizationError, isCronRequestAuthorized } from "./cronAuth";

function requestWithAuthorization(value?: string) {
  return new Request("https://www.indegenius.africa/api/cron/health", {
    headers: value ? { authorization: value } : undefined,
  });
}

describe("cron authorization", () => {
  it("fails closed when the server secret is missing", () => {
    expect(
      isCronRequestAuthorized(requestWithAuthorization("Bearer anything"), "")
    ).toBe(false);
  });

  it("requires an exact bearer token", () => {
    expect(
      isCronRequestAuthorized(requestWithAuthorization("Bearer correct"), "correct")
    ).toBe(true);
    expect(
      isCronRequestAuthorized(requestWithAuthorization("Bearer wrong"), "correct")
    ).toBe(false);
    expect(isCronRequestAuthorized(requestWithAuthorization(), "correct")).toBe(false);
  });

  it("returns the shared forbidden response for unauthorized requests", async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "correct";

    try {
      const response = getCronAuthorizationError(
        requestWithAuthorization("Bearer wrong")
      );
      expect(response?.status).toBe(403);
      await expect(response?.json()).resolves.toEqual({ error: "Forbidden" });
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});
