import { describe, expect, it } from "vitest";
import {
  parseTopicSuggestionRequest,
  topicSuggestionFingerprint,
  topicSuggestionLimit,
} from "@/lib/topicSuggestions";

describe("topic suggestion request validation", () => {
  it("accepts each publishing kind and strips Article markup", () => {
    const parsed = parseTopicSuggestionRequest({
      contentKind: "article",
      title: "African technology policy",
      content: "<p>How public institutions can support responsible innovation.</p>",
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        request: expect.objectContaining({ contentKind: "article" }),
        sourceText:
          "African technology policy How public institutions can support responsible innovation.",
      })
    );
  });

  it("rejects undersized, malformed, and oversized keyword requests", () => {
    expect(
      parseTopicSuggestionRequest({ contentKind: "post", body: "Too short" })
    ).toEqual(expect.objectContaining({ error: expect.any(String) }));
    expect(
      parseTopicSuggestionRequest({
        contentKind: "research",
        title: "A study",
        abstract: "A sufficiently descriptive abstract for classification.",
        keywords: Array.from({ length: 11 }, (_, index) => `keyword ${index}`),
      })
    ).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  it("uses three results for Posts and five for long-form work", () => {
    expect(topicSuggestionLimit("post")).toBe(3);
    expect(topicSuggestionLimit("article")).toBe(5);
    expect(topicSuggestionLimit("research")).toBe(5);
  });

  it("changes the local cache fingerprint when material content changes", () => {
    const first = topicSuggestionFingerprint({
      contentKind: "post",
      body: "Technology policy should include students and researchers.",
    });
    const second = topicSuggestionFingerprint({
      contentKind: "post",
      body: "Climate policy should include students and researchers.",
    });
    expect(first).not.toBe(second);
  });
});
