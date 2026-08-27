import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const previousSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
});

describe("cron health route", () => {
  it("rejects a missing authorization header", async () => {
    process.env.CRON_SECRET = "health-secret";
    const response = await GET(
      new NextRequest("https://www.indegenius.africa/api/cron/health")
    );

    expect(response.status).toBe(403);
  });

  it("returns a side-effect-free health response when authorized", async () => {
    process.env.CRON_SECRET = "health-secret";
    const response = await GET(
      new NextRequest("https://www.indegenius.africa/api/cron/health", {
        headers: { authorization: "Bearer health-secret" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "indegenius-cron",
    });
  });
});
