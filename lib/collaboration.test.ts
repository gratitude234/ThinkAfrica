import { describe, expect, it } from "vitest";
import { getCollaborationSummary } from "./collaboration";

function baseInput(overrides: Partial<Parameters<typeof getCollaborationSummary>[0]> = {}) {
  return {
    postId: "post-1",
    postSlug: "a-post",
    authorId: "author-1",
    viewerId: "viewer-1",
    responseCount: 0,
    coauthorCount: 0,
    isFollowingAuthor: false,
    messageEligible: true,
    messageReason: null,
    ...overrides,
  };
}

describe("getCollaborationSummary responseHref (responses are always Articles)", () => {
  it("points a response to the Article composer via kind=article, regardless of what kind of post is being responded to", () => {
    // The parent post's kind/type is deliberately not part of the input here:
    // a response to a titleless Post, a generic Article, or a legacy
    // Essay/Policy Brief must all resolve the same way -- the response
    // itself is always an Article.
    const summary = getCollaborationSummary(baseInput({ postId: "titleless-post-id" }));

    expect(summary.responseHref).toBe("/write?inResponseTo=titleless-post-id&kind=article");
  });

  it("uses the stable kind=article param, not a legacy type= param", () => {
    const summary = getCollaborationSummary(baseInput());

    expect(summary.responseHref).not.toContain("type=essay");
    expect(summary.responseHref).toContain("kind=article");
  });
});
