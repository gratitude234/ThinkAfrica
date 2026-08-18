import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { handlePostEngagement } from "./postEngagementServer";
import { createFeaturedExposure } from "./feedExposure";
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
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
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

  it("rejects an unsigned view before querying delivery attribution", async () => {
    const admin = {
      from: vi.fn(),
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/view", {
        method: "POST",
        body: JSON.stringify({ deliveryToken: "guessable" }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "view"
    );

    expect(response.status).toBe(400);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("updates the matched delivery once a valid long-form read qualifies", async () => {
    const delivery = selectOne({
      id: "delivery-id",
      event_id: "event-id",
      channel: "email",
      status: "sent",
      matched_author_ids: ["author-id"],
    });
    const event = selectOne({ post_id: "post-id" });
    const post = selectOne({
      id: "post-id",
      slug: "work",
      status: "published",
      content: Array.from({ length: 601 }, () => "word").join(" "),
    });
    let deliveryCalls = 0;
    let deliveryPatch: Record<string, unknown> | null = null;
    const updatedFilters: Array<[string, unknown]> = [];
    const updateBuilder: Record<string, unknown> = {};
    updateBuilder.eq = vi.fn((column: string, value: unknown) => {
      updatedFilters.push([column, value]);
      return updateBuilder;
    });
    updateBuilder.is = vi.fn(async (column: string, value: unknown) => {
      updatedFilters.push([column, value]);
      return { error: null };
    });

    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) => {
        if (table === "publication_deliveries") {
          deliveryCalls += 1;
          if (deliveryCalls === 1) return delivery;
          return {
            update: vi.fn((patch: Record<string, unknown>) => {
              deliveryPatch = patch;
              return updateBuilder;
            }),
          };
        }
        if (table === "publication_events") return event;
        if (table === "posts") return post;
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/read", {
        method: "POST",
        body: JSON.stringify({
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
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_post_engagement",
      expect.objectContaining({
        engagement_metadata: expect.objectContaining({
          engagementTokenId: expect.any(String),
          distribution: {
            source: "author_subscription",
            deliveryId: "delivery-id",
            channel: "email",
          },
        }),
      })
    );
    expect(deliveryPatch).toEqual({
      viewed_at: expect.any(String),
      qualified_read_at: expect.any(String),
    });
    expect(updatedFilters).toContainEqual(["id", "delivery-id"]);
    expect(updatedFilters).toContainEqual(["qualified_read_at", null]);
  });

  it("attributes a topic-only delivery to the topic subscription source", async () => {
    const delivery = selectOne({
      id: "topic-delivery-id",
      event_id: "event-id",
      channel: "in_app",
      status: "sent",
      matched_author_ids: [],
    });
    const event = selectOne({ post_id: "post-id" });
    const post = selectOne({
      id: "post-id",
      slug: "work",
      status: "published",
      content: "A short publication.",
    });
    const updateBuilder = {
      eq: vi.fn(),
      is: vi.fn().mockResolvedValue({ error: null }),
    };
    updateBuilder.eq.mockReturnValue(updateBuilder);

    let deliveryCalls = 0;
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) => {
        if (table === "publication_deliveries") {
          deliveryCalls += 1;
          if (deliveryCalls === 1) return delivery;
          return { update: vi.fn(() => updateBuilder) };
        }
        if (table === "publication_events") return event;
        if (table === "posts") return post;
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    mockedAdminClient.mockReturnValue(admin as never);

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/view", {
        method: "POST",
        body: JSON.stringify({
          deliveryToken: "123e4567-e89b-42d3-a456-426614174000",
          engagementToken: engagementToken(),
        }),
        headers: { "content-type": "application/json" },
      }),
      Promise.resolve({ slug: "work" }),
      "view"
    );

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_post_engagement",
      expect.objectContaining({
        engagement_metadata: expect.objectContaining({
          engagementTokenId: expect.any(String),
          distribution: {
            source: "topic_subscription",
            deliveryId: "topic-delivery-id",
            channel: "in_app",
          },
        }),
      })
    );
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
    const exposure = createFeaturedExposure(
      "post-id",
      "work",
      "recommended",
      "request-verified",
      "session-verified",
      new Date().toISOString()
    );

    const response = await handlePostEngagement(
      new NextRequest("http://localhost/api/posts/work/impression", {
        method: "POST",
        body: JSON.stringify({
          surface: "home_featured",
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
          candidateSource: "featured_recommended",
          surface: "home_featured",
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
      "home_featured",
      "following",
      "subscriptions",
      "topics",
      "latest",
      "feed",
      "bookmarks",
      "explore-for-you",
      "explore-trending",
      "explore-citable",
      "responses",
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
