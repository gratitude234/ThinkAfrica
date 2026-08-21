import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEED_ALGORITHM_VERSION,
  prepareFeedPageForClient,
  verifyFeedExposureMetadata,
} from "./feedExposure";
import type { PostCardData } from "@/components/post/PostCard";

function post(id: string): PostCardData {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    excerpt: "An excerpt",
    type: "blog",
    content_kind: "post",
    tags: [],
    created_at: "2026-08-18T10:00:00.000Z",
    published_at: "2026-08-18T10:00:00.000Z",
    score: 91,
    quality_score: 73,
    impression_count: 100,
    read_count: 20,
    view_count: 40,
    reference_count: 3,
    bookmark_count: 5,
    profiles: {
      username: "amara",
      full_name: "Amara",
      university: null,
      avatar_url: null,
    },
  };
}

describe("prepareFeedPageForClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T13:00:00.000Z"));
    vi.stubEnv("FEED_EXPOSURE_SIGNING_SECRET", "test-feed-signing-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("strips ranking-only fields and adds experiment-grade exposure context", () => {
    const result = prepareFeedPageForClient(
      { posts: [post("a")], hasMore: true },
      {
        tab: "home",
        page: 2,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-1",
        servedAt: "2026-08-18T12:00:00.000Z",
      }
    );

    expect(result.posts[0]).not.toHaveProperty("score");
    expect(result.posts[0]).not.toHaveProperty("quality_score");
    expect(result.posts[0]).not.toHaveProperty("impression_count");
    expect(result.posts[0]).not.toHaveProperty("read_count");
    expect(result.posts[0]).not.toHaveProperty("view_count");
    expect(result.posts[0].feed_exposure).toEqual({
      postId: "a",
      slug: "post-a",
      exposureId: "request-1:13:a",
      feedSessionId: "request-1",
      requestId: "request-1",
      algorithmVersion: FEED_ALGORITHM_VERSION,
      experimentVariant: "ranking_v2",
      surface: "home",
      candidateSource: "for_you_ranked",
      position: 13,
      page: 2,
      servedAt: "2026-08-18T12:00:00.000Z",
      signature: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    expect(
      verifyFeedExposureMetadata(result.posts[0].feed_exposure, "post-a")
    ).toMatchObject({ postId: "a", position: 13, surface: "home" });
    expect(result.hasMore).toBe(true);
  });

  it("rejects tampered or cross-post exposure attribution", () => {
    const result = prepareFeedPageForClient(
      { posts: [post("a")], hasMore: false },
      {
        tab: "latest",
        page: 1,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-verified",
        servedAt: new Date().toISOString(),
      }
    );
    const exposure = result.posts[0].feed_exposure!;

    expect(verifyFeedExposureMetadata(exposure, "post-a")).not.toBeNull();
    expect(
      verifyFeedExposureMetadata({ ...exposure, position: 99 }, "post-a")
    ).toBeNull();
    expect(verifyFeedExposureMetadata(exposure, "different-post")).toBeNull();
  });

  it("marks home pages beyond the ranked window as chronological tail", () => {
    const result = prepareFeedPageForClient(
      { posts: [post("tail")], hasMore: false },
      {
        tab: "home",
        page: 11,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-tail",
      }
    );

    expect(result.posts[0].feed_exposure?.candidateSource).toBe("for_you_tail");
  });
});
