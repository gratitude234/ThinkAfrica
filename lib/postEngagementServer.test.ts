import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { handlePostEngagement } from "./postEngagementServer";
import { prepareFeedPageForClient } from "./feedExposure";
import { createPostEngagementToken } from "./postEngagementToken";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const mockedAdminClient = vi.mocked(createAdminClient);
const mockedServerClient = vi.mocked(createClient);

function selectOne(data: unknown) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function engagementToken(ageSeconds = 60) {
  return createPostEngagementToken(
    "post-id",
    "work",
    new Date(Date.now() - ageSeconds * 1000)
  );
}

describe("post engagement server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("FEED_EXPOSURE_SIGNING_SECRET", "test-feed-signing-secret");
    vi.stubEnv("POST_ENGAGEMENT_SIGNING_SECRET", "test-engagement-secret");
    mockedServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "reader-id" } },
        }),
      },
    } as never);
  });

  it("rejects an unsigned view before querying anything", async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/view", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "view"
    );

    expect(response.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("records a qualified long-form read against the posts table alone", async () => {
    const post = selectOne({
      id: "post-id",
      slug: "work",
      status: "published",
      content: Array.from({ length: 601 }, () => "word").join(" "),
    });
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) => {
        if (table === "posts") return post;
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/read", {
        method: "POST",
        body: JSON.stringify({
          // A retired tracked-delivery link still carries this. It is ignored.
          deliveryToken: "123e4567-e89b-42d3-a456-426614174000",
          engagementToken: engagementToken(),
          readSeconds: 30,
          scrollDepth: 60,
          metadata: {
            distribution: { source: "client-forged" },
            position: 2,
            ignored: "drop me",
          },
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "read"
    );

    expect(response.status).toBe(200);
    expect(admin.from.mock.calls.map((call) => call[0])).toEqual(["posts"]);
    const rpcInput = admin.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rpcInput.engagement_metadata).toEqual({
      engagementTokenId: expect.any(String),
    });
  });

  it("uses authoritative word count to reject an under-threshold long-form read", async () => {
    const post = selectOne({
      id: "post-id",
      slug: "work",
      status: "published",
      content: Array.from({ length: 601 }, () => "word").join(" "),
    });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "posts") return post;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/read", {
        method: "POST",
        body: JSON.stringify({
          engagementToken: engagementToken(),
          readSeconds: 29.99,
          scrollDepth: 60,
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "read"
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Read engagement did not meet qualification requirements.",
    });
    expect(admin.from).toHaveBeenCalledWith("posts");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("accepts the same metrics for a short publication and records the sanitized values", async () => {
    const post = selectOne({
      id: "post-id",
      slug: "work",
      status: "published",
      content: Array.from({ length: 600 }, () => "word").join(" "),
    });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "posts") return post;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/read", {
        method: "POST",
        body: JSON.stringify({
          engagementToken: engagementToken(),
          readSeconds: 15.9,
          scrollDepth: 50.9,
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "read"
    );

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_post_engagement",
      expect.objectContaining({
        engagement_read_seconds: 15,
        engagement_scroll_depth: 50,
      })
    );
  });

  it("rejects an instantly forged qualifying read even with a valid page token", async () => {
    const post = selectOne({
      id: "post-id",
      slug: "work",
      status: "published",
      content: Array.from({ length: 600 }, () => "word").join(" "),
    });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "posts") return post;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/read", {
        method: "POST",
        body: JSON.stringify({
          engagementToken: engagementToken(0),
          readSeconds: 15,
          scrollDepth: 50,
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "read"
    );

    expect(response.status).toBe(400);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed read metrics before querying or mutating engagement", async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/read", {
        method: "POST",
        body: JSON.stringify({ readSeconds: 30, scrollDepth: 101 }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "read"
    );

    expect(response.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("normalizes unknown surfaces and bounds routes and client metadata", async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);
    const route = `/feed?query=${"x".repeat(600)}\nforged`;

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/view", {
        method: "POST",
        body: JSON.stringify({
          engagementToken: engagementToken(),
          surface: "made-up-surface",
          route,
          readSeconds: 9_999,
          scrollDepth: 100,
          metadata: {
            requestId: "  request-id  ",
            position: 3,
            candidateSource: true,
            module: `module-${"m".repeat(200)}`,
            distribution: { source: "forged" },
            nested: { value: "drop" },
            placement: ["drop"],
          },
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "view"
    );

    expect(response.status).toBe(200);
    const rpcInput = admin.rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(rpcInput.engagement_surface).toBe("unknown");
    expect(rpcInput.engagement_route).toHaveLength(512);
    expect(rpcInput.engagement_route).not.toMatch(/[\n\r]/);
    expect(rpcInput.engagement_read_seconds).toBeNull();
    expect(rpcInput.engagement_scroll_depth).toBeNull();
    expect(rpcInput.engagement_metadata).toEqual({
      engagementTokenId: expect.any(String),
      module: expect.stringMatching(/^module-m+$/),
    });
    expect(
      ((rpcInput.engagement_metadata as Record<string, unknown>).module as string)
        .length
    ).toBe(96);
  });

  it("accepts feed attribution only when the served exposure signature verifies", async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);
    const exposure = prepareFeedPageForClient(
      {
        posts: [
          {
            id: "post-id",
            slug: "work",
            title: "Work",
            excerpt: null,
            type: "blog",
            tags: [],
            created_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
            profiles: null,
          },
        ],
        hasMore: false,
      },
      {
        tab: "home",
        page: 1,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-verified",
        feedSessionId: "session-verified",
      }
    ).posts[0].feed_exposure;

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/impression", {
        method: "POST",
        body: JSON.stringify({
          surface: "home",
          metadata: exposure,
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "impression"
    );

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_post_engagement",
      expect.objectContaining({
        engagement_metadata: expect.objectContaining({
          postId: "post-id",
          slug: "work",
          requestId: "request-verified",
          candidateSource: "for_you_discovery",
          surface: "home",
        }),
      })
    );
  });

  it("preserves every surface currently emitted by PostCard and Home cards", async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);
    const surfaces = [
      "home",
      "following",
      "feed",
      "bookmarks",
      "explore-for-you",
      "explore-trending",
      "explore-citable",
      "topic",
    ];

    for (const surface of surfaces) {
      const response = await handlePostEngagement(
        new NextRequest("http://localhost/api/posts/work/view", {
          method: "POST",
          body: JSON.stringify({
            engagementToken: engagementToken(),
            surface,
          }),
          headers: { "content-type": "application/json" },
        }),
        Promise.resolve({ slug: "work" }),
        "view"
      );
      expect(response.status).toBe(200);
    }

    expect(admin.rpc.mock.calls.map((call) => call[1].engagement_surface)).toEqual(
      surfaces
    );
  });
});
