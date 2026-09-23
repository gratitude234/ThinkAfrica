import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEED_ALGORITHM_VERSION,
  prepareFeedPageForClient,
  verifyFeedExposureMetadata,
  type FeedExposure,
} from "./feedExposure";
import type { PostCardData } from "@/components/post/PostCard";

const SECRET = "test-feed-signing-secret";

function post(id: string, overrides: Partial<PostCardData> = {}): PostCardData {
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
    impression_count: 100,
    read_count: 20,
    view_count: 40,
    bookmark_count: 5,
    profiles: {
      username: "amara",
      full_name: "Amara",
      university: null,
      avatar_url: null,
    },
    ...overrides,
  };
}

/** The server's own canonical form, for forging an exposure in a test. */
function sign(exposure: Omit<FeedExposure, "signature">) {
  return createHmac("sha256", SECRET)
    .update(
      JSON.stringify([
        exposure.postId,
        exposure.slug,
        exposure.exposureId,
        exposure.feedSessionId,
        exposure.requestId,
        exposure.algorithmVersion,
        exposure.experimentVariant,
        exposure.surface,
        exposure.candidateSource,
        exposure.position,
        exposure.page,
        exposure.servedAt,
      ])
    )
    .digest("base64url");
}

describe("prepareFeedPageForClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T13:00:00.000Z"));
    vi.stubEnv("FEED_EXPOSURE_SIGNING_SECRET", SECRET);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("strips ranking-only fields and adds experiment-grade exposure context", () => {
    const result = prepareFeedPageForClient(
      { posts: [post("a", { candidate_source: "for_you_fresh" })], hasMore: true },
      {
        tab: "home",
        page: 2,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-1",
        servedAt: "2026-08-18T12:00:00.000Z",
      }
    );

    for (const field of [
      "score",
      "impression_count",
      "read_count",
      "view_count",
      "bookmark_count",
      "candidate_source",
    ]) {
      expect(result.posts[0]).not.toHaveProperty(field);
    }
    expect(result.posts[0].feed_exposure).toEqual({
      postId: "a",
      slug: "post-a",
      exposureId: "request-1:13:a",
      feedSessionId: "request-1",
      requestId: "request-1",
      algorithmVersion: FEED_ALGORITHM_VERSION,
      experimentVariant: "ranking_v4",
      surface: "home",
      candidateSource: "for_you_fresh",
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

  it("attributes Following to the writers followed, and rejects tampering", () => {
    const result = prepareFeedPageForClient(
      { posts: [post("a")], hasMore: false },
      {
        tab: "following",
        page: 1,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-verified",
        servedAt: new Date().toISOString(),
      }
    );
    const exposure = result.posts[0].feed_exposure!;

    expect(exposure.candidateSource).toBe("followed_author");
    expect(verifyFeedExposureMetadata(exposure, "post-a")).not.toBeNull();
    expect(
      verifyFeedExposureMetadata({ ...exposure, position: 99 }, "post-a")
    ).toBeNull();
    expect(verifyFeedExposureMetadata(exposure, "different-post")).toBeNull();
  });

  it("marks For You pages beyond the ranked window as the date-ordered tail", () => {
    const result = prepareFeedPageForClient(
      { posts: [post("tail")], hasMore: false },
      {
        tab: "home",
        page: 17,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-tail",
      }
    );

    expect(result.posts[0].feed_exposure?.candidateSource).toBe("for_you_tail");
  });

  it("accepts no exposure from a retired surface, even one correctly signed", () => {
    const { signature: _signature, ...served } = prepareFeedPageForClient(
      { posts: [post("a")], hasMore: false },
      {
        tab: "home",
        page: 1,
        pageSize: 12,
        rankedWindow: 120,
        requestId: "request-retired",
        servedAt: new Date().toISOString(),
      }
    ).posts[0].feed_exposure!;

    // The forging helper matches the server, so a failure below is the
    // allowlist refusing the value rather than a bad signature.
    expect(verifyFeedExposureMetadata({ ...served, signature: sign(served) }, "post-a")).not.toBeNull();

    for (const retired of [
      { surface: "latest", candidateSource: "latest" },
      { surface: "subscriptions", candidateSource: "subscription" },
      { surface: "home_featured", candidateSource: "featured_editorial" },
      { surface: "home", candidateSource: "for_you_ranked" },
      { surface: "home", candidateSource: "for_you_fresh", algorithmVersion: "feed-v3.0.0" },
    ]) {
      const forged = { ...served, ...retired } as Omit<FeedExposure, "signature">;
      expect(
        verifyFeedExposureMetadata({ ...forged, signature: sign(forged) }, "post-a")
      ).toBeNull();
    }
  });
});
