import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const repositories = vi.hoisted(() => ({
  primary: {
    backend: "supabase" as const,
    load: vi.fn(),
  },
  postgres: {
    backend: "postgres" as const,
    load: vi.fn(),
  },
}));

vi.mock("@/lib/db/readAdapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/readAdapter")>();
  return {
    ...actual,
    feedViewerRepository: vi.fn(() => repositories.primary),
    postgresFeedViewerRepository: vi.fn(() => repositories.postgres),
  };
});

vi.mock("@/lib/blocking", () => ({
  getFeedExcludedUserIds: vi.fn(),
}));

const {
  isFeedViewerPostgresFailoverEnabled,
  isFeedViewerTransportFailure,
  loadFeedViewer,
} = await import("./feedViewer");

describe("feed viewer transport failover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FEED_VIEWER_POSTGRES_FAILOVER;
  });

  it("recognises the production Supabase deadline as a transport failure", () => {
    const error = Object.assign(
      new Error("Supabase did not respond within 8000ms. The request was abandoned rather than held open."),
      { name: "SupabaseTimeoutError" }
    );
    expect(isFeedViewerTransportFailure(error)).toBe(true);
    expect(isFeedViewerTransportFailure({ status: 504, message: "Gateway Timeout" })).toBe(true);
    expect(isFeedViewerTransportFailure({ code: "42501", message: "forbidden" })).toBe(false);
  });

  it("keeps PostgreSQL failover opt-in", () => {
    expect(isFeedViewerPostgresFailoverEnabled()).toBe(false);
    expect(isFeedViewerPostgresFailoverEnabled("1")).toBe(true);
    expect(isFeedViewerPostgresFailoverEnabled("true")).toBe(false);
    expect(isFeedViewerPostgresFailoverEnabled("0")).toBe(false);
  });

  it("serves through PostgreSQL when the Supabase viewer context times out and failover is enabled", async () => {
    process.env.FEED_VIEWER_POSTGRES_FAILOVER = "1";
    repositories.primary.load.mockRejectedValueOnce(
      Object.assign(new Error("Supabase did not respond within 8000ms."), {
        name: "SupabaseTimeoutError",
      })
    );
    repositories.postgres.load.mockResolvedValueOnce({
      userInterests: ["Climate"],
      followedIds: ["writer-1"],
      excludedAuthorIds: ["blocked-1"],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      loadFeedViewer({} as never, "user-1")
    ).resolves.toEqual({
      userId: "user-1",
      userInterests: ["Climate"],
      followedIds: ["writer-1"],
      excludedAuthorIds: ["blocked-1"],
    });
    expect(repositories.postgres.load).toHaveBeenCalledWith({
      userId: "user-1",
      personalized: true,
    });
    warn.mockRestore();
  });

  it("does not route permission failures to a second backend", async () => {
    process.env.FEED_VIEWER_POSTGRES_FAILOVER = "1";
    repositories.primary.load.mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), { code: "42501" })
    );

    await expect(loadFeedViewer({} as never, "user-1")).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load feed viewer context",
      code: "42501",
    });
    expect(repositories.postgres.load).not.toHaveBeenCalled();
  });

  it("fails closed when both transports cannot resolve block-safe viewer context", async () => {
    process.env.FEED_VIEWER_POSTGRES_FAILOVER = "1";
    repositories.primary.load.mockRejectedValueOnce(
      Object.assign(new Error("Gateway Timeout"), { status: 504 })
    );
    repositories.postgres.load.mockRejectedValueOnce(new Error("database unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(loadFeedViewer({} as never, "user-1")).rejects.toMatchObject({
      name: "FeedDataError",
      operation: "load feed viewer context",
    });
    errorSpy.mockRestore();
  });
});
