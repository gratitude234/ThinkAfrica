import { describe, expect, it } from "vitest";
import { resolveContentKind } from "@/lib/contentModel";
import {
  ARTICLE_FIXTURES,
  POST_FIXTURES,
} from "./homeFeedFixtures";
import * as fixtureModule from "./homeFeedFixtures";

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

  it("has no Research fixtures, because Research is no longer a product", () => {
    for (const fixture of [...POST_FIXTURES, ...ARTICLE_FIXTURES]) {
      expect(resolveContentKind(fixture.post)).not.toBe("research");
    }
  });

  it("classifies every fixture as a Post or an Article, and nothing else", () => {
    // The genre a fixture used to carry went with posts.article_format, which
    // 20260915000006 pinned to null.
    for (const fixture of [...POST_FIXTURES, ...ARTICLE_FIXTURES]) {
      expect(["post", "article"], fixture.id).toContain(fixture.post.content_kind);
    }
  });

  it("carries only the publication cards Home still renders", () => {
    // The featured lead, sidebar, activation, writer, topic and surface-reason
    // fixtures went with those Home modules in Phase 2F.
    expect(Object.keys(fixtureModule).sort()).toEqual(["ARTICLE_FIXTURES", "POST_FIXTURES"]);
  });

  it("gives every fixture card a unique id (React key stability in the preview list)", () => {
    const ids = [...POST_FIXTURES, ...ARTICLE_FIXTURES].map((fixture) => fixture.post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

});
