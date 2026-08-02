import { describe, expect, it } from "vitest";
import { POST_POINTS, RESPONSE_POINTS, pointsForPost } from "./utils";

describe("pointsForPost", () => {
  it("scores an original post by its type", () => {
    expect(pointsForPost({ type: "blog", in_response_to: null })).toBe(POST_POINTS.blog);
    expect(pointsForPost({ type: "essay", in_response_to: null })).toBe(POST_POINTS.essay);
    expect(pointsForPost({ type: "research", in_response_to: null })).toBe(POST_POINTS.research);
  });

  it("scores anything that answers another post as a response, whatever its type", () => {
    expect(pointsForPost({ type: "blog", in_response_to: "parent-1" })).toBe(RESPONSE_POINTS);
    // The type no longer decides it -- a research paper written as a response
    // scores as a response.
    expect(pointsForPost({ type: "research", in_response_to: "parent-1" })).toBe(RESPONSE_POINTS);
  });

  it("is worth less than the cheapest original post", () => {
    expect(RESPONSE_POINTS).toBeLessThan(POST_POINTS.blog);
  });

  it("falls back to the blog value for an unknown type", () => {
    expect(pointsForPost({ type: "something-else", in_response_to: null })).toBe(10);
    expect(pointsForPost({})).toBe(10);
  });
});
