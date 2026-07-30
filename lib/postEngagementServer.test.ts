import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { handlePostEngagement } from "./postEngagementServer";

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

describe("post engagement publication attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    mockedServerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "reader-id" } },
        }),
      },
    } as never);
  });

  it("does not query or mutate deliveries for an invalid token", async () => {
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

    expect(response.status).toBe(200);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith(
      "record_post_engagement",
      expect.objectContaining({
        engagement_metadata: {},
      })
    );
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
          readSeconds: 30,
          scrollDepth: 60,
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
        engagement_metadata: {
          distribution: {
            source: "author_subscription",
            deliveryId: "delivery-id",
            channel: "email",
          },
        },
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
        engagement_metadata: {
          distribution: {
            source: "topic_subscription",
            deliveryId: "topic-delivery-id",
            channel: "in_app",
          },
        },
      })
    );
  });
});
