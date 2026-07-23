import { describe, expect, it } from "vitest";
import { resolveContentKind } from "@/lib/contentModel";
import {
  ARTICLE_FIXTURES,
  POST_FIXTURES,
  RESEARCH_FIXTURES,
  WRITER_FIXTURES,
} from "./homeFeedFixtures";

describe("homeFeedFixtures", () => {
  it("classifies every Post fixture as the Post content kind", () => {
    for (const fixture of POST_FIXTURES) {
      expect(resolveContentKind(fixture.post)).toBe("post");
    }
  });

  it("classifies every Article fixture as the Article content kind", () => {
    for (const fixture of ARTICLE_FIXTURES) {
      expect(resolveContentKind(fixture.post)).toBe("article");
    }
  });

  it("classifies every Research fixture as the Research content kind", () => {
    for (const fixture of RESEARCH_FIXTURES) {
      expect(resolveContentKind(fixture.post)).toBe("research");
    }
  });

  it("never labels a generic Article fixture as an Essay", () => {
    const general = ARTICLE_FIXTURES.find((fixture) => fixture.id === "article-general");
    expect(general?.post.article_format).toBeNull();
  });

  it("gives every fixture card a unique id (React key stability in the preview list)", () => {
    const ids = [...POST_FIXTURES, ...ARTICLE_FIXTURES, ...RESEARCH_FIXTURES].map((fixture) => fixture.post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caps the writer suggestion pool at more than three so the rail's cap is actually exercised", () => {
    expect(WRITER_FIXTURES.length).toBeGreaterThan(3);
  });

  it("never recommends the current user or an already-followed writer by using placeholder/duplicate ids", () => {
    const ids = WRITER_FIXTURES.map((writer) => writer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
