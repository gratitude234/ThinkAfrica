import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processPendingPublicationEvents } from "@/lib/publicationDistribution";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";

vi.mock("@/lib/publicationDistribution", () => ({
  processPendingPublicationEvents: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const previousSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (previousSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = previousSecret;
});

function authorizedRequest(query = "") {
  return new NextRequest(
    `https://www.indegenius.africa/api/cron/process-publication-deliveries${query}`,
    { headers: { authorization: "Bearer publication-secret" } }
  );
}

describe("publication delivery cron route", () => {
  it("rejects unauthorized requests before touching the database or worker", async () => {
    process.env.CRON_SECRET = "publication-secret";

    const response = await GET(
      new NextRequest(
        "https://www.indegenius.africa/api/cron/process-publication-deliveries"
      )
    );

    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(processPendingPublicationEvents).not.toHaveBeenCalled();
  });

  it("reports pending and unexpired counts without claiming events", async () => {
    process.env.CRON_SECRET = "publication-secret";
    const pendingQuery = {
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ count: 32, error: null })),
      })),
    };
    const unexpiredQuery = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gt: vi.fn(async () => ({ count: 23, error: null })),
        })),
      })),
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi
        .fn()
        .mockReturnValueOnce(pendingQuery)
        .mockReturnValueOnce(unexpiredQuery),
    } as never);

    const response = await GET(authorizedRequest("?dryRun=1"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      dryRun: true,
      pending: 32,
      pendingUnexpired: 23,
    });
    expect(processPendingPublicationEvents).not.toHaveBeenCalled();
  });

  it("processes one bounded batch in normal mode", async () => {
    process.env.CRON_SECRET = "publication-secret";
    vi.mocked(processPendingPublicationEvents).mockResolvedValue({
      enabled: true,
      claimed: 2,
      processed: 2,
      failed: 0,
    });

    const response = await GET(authorizedRequest());

    expect(processPendingPublicationEvents).toHaveBeenCalledWith(10);
    await expect(response.json()).resolves.toEqual({
      dryRun: false,
      enabled: true,
      claimed: 2,
      processed: 2,
      failed: 0,
    });
  });
});
