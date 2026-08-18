import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPostEngagementToken,
  verifyPostEngagementToken,
} from "./postEngagementToken";

describe("post engagement tokens", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    vi.stubEnv("POST_ENGAGEMENT_SIGNING_SECRET", "test-engagement-secret");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("binds a signed token to the post and slug", () => {
    const token = createPostEngagementToken("post-1", "public-trust")!;

    expect(verifyPostEngagementToken(token, "public-trust", "post-1")).toMatchObject({
      postId: "post-1",
      slug: "public-trust",
      issuedAt: "2026-08-18T12:00:00.000Z",
    });
    expect(verifyPostEngagementToken(token, "other-slug", "post-1")).toBeNull();
    expect(verifyPostEngagementToken(token, "public-trust", "post-2")).toBeNull();
  });

  it("rejects tampering and expired tokens", () => {
    const token = createPostEngagementToken("post-1", "public-trust")!;
    const [payload, signature] = token.split(".");

    expect(
      verifyPostEngagementToken(`${payload}x.${signature}`, "public-trust")
    ).toBeNull();
    vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 1);
    expect(verifyPostEngagementToken(token, "public-trust")).toBeNull();
  });
});
