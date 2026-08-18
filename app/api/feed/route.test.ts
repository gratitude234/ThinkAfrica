import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { FeedCursorError } from "@/lib/feedData";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchFeedPage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/feedData", () => ({
  FeedCursorError: class FeedCursorError extends Error {},
  fetchFeedPage: mocks.fetchFeedPage,
  MAX_FEED_PAGE: 100,
  MAX_FEED_PAGE_SIZE: 30,
  RANKED_FEED_WINDOW: 120,
  normalizeFeedContentFilter: (value: string | null) => value ?? "all",
}));

vi.mock("@/lib/featureFlags", () => ({
  isAuthorSubscriptionsUxV2Enabled: () => false,
  isTopicSubscriptionsEnabled: () => false,
}));

vi.mock("@/lib/blocking", () => ({
  getFeedExcludedUserIds: vi.fn().mockResolvedValue([]),
}));

describe("GET /api/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    });
  });

  it("rejects out-of-bounds pagination before opening a database client", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/feed?page=101&pageSize=12")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_PAGINATION" },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.fetchFeedPage).not.toHaveBeenCalled();
  });

  it("returns a retryable 500 instead of disguising a query failure as empty", async () => {
    mocks.fetchFeedPage.mockRejectedValueOnce(new Error("database unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new NextRequest("http://localhost/api/feed"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: "FEED_UNAVAILABLE",
        message: "The feed could not be loaded. Please try again.",
      },
    });
    errorSpy.mockRestore();
  });

  it("returns 400 for a cursor that does not match the requested feed", async () => {
    mocks.fetchFeedPage.mockRejectedValueOnce(new FeedCursorError());

    const response = await GET(
      new NextRequest("http://localhost/api/feed?tab=latest&cursor=bad")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_CURSOR" },
    });
  });

  it("adds server-minted exposure context to a successful response", async () => {
    mocks.fetchFeedPage.mockResolvedValueOnce({
      posts: [
        {
          id: "post-1",
          title: "A post",
          slug: "a-post",
          excerpt: "Excerpt",
          type: "blog",
          content_kind: "post",
          tags: [],
          created_at: "2026-08-18T10:00:00.000Z",
          published_at: "2026-08-18T10:00:00.000Z",
          score: 98,
          impression_count: 50,
          profiles: null,
        },
      ],
      hasMore: false,
    });

    const response = await GET(new NextRequest("http://localhost/api/feed"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.posts[0]).not.toHaveProperty("score");
    expect(body.posts[0]).not.toHaveProperty("impression_count");
    expect(body.posts[0].feed_exposure).toMatchObject({
      algorithmVersion: "feed-v2.0.0",
      surface: "home",
      candidateSource: "for_you_ranked",
      position: 1,
    });
  });
});
