import { describe, expect, it } from "vitest";
import {
  getPostDisplayTitle,
  getPostMetadataTitle,
  getPostReferenceQuoted,
  getPostReferenceSuffix,
  isLightweightPost,
} from "@/lib/postDisplay";

describe("getPostDisplayTitle", () => {
  it("returns the trimmed title when present", () => {
    expect(getPostDisplayTitle({ title: "  Hello world  " })).toBe("Hello world");
  });

  it("returns null for a null title", () => {
    expect(getPostDisplayTitle({ title: null })).toBeNull();
  });

  it("returns null for a whitespace-only title", () => {
    expect(getPostDisplayTitle({ title: "   " })).toBeNull();
  });

  it("returns null for a missing title field", () => {
    expect(getPostDisplayTitle({})).toBeNull();
  });
});

describe("getPostMetadataTitle", () => {
  it("prefers the display title when present", () => {
    expect(getPostMetadataTitle({ title: "My Essay" }, { full_name: "Ada" })).toBe("My Essay");
  });

  it("falls back to 'Post by {author full_name}' when title is null", () => {
    expect(getPostMetadataTitle({ title: null }, { full_name: "Ada Lovelace" })).toBe(
      "Post by Ada Lovelace"
    );
  });

  it("falls back to username when full_name is absent", () => {
    expect(getPostMetadataTitle({ title: null }, { username: "ada" })).toBe("Post by ada");
  });

  it("falls back to a generic author phrase when no author info is given", () => {
    expect(getPostMetadataTitle({ title: null })).toBe("Post by an Indegenius author");
    expect(getPostMetadataTitle({ title: null }, null)).toBe("Post by an Indegenius author");
  });

  it("never returns an empty string", () => {
    expect(getPostMetadataTitle({ title: "" }, { full_name: "" })).toBe(
      "Post by an Indegenius author"
    );
  });
});

describe("getPostReferenceSuffix (for '{actor} liked your post{suffix}' sentences)", () => {
  it("is a colon-quoted title when present", () => {
    expect(getPostReferenceSuffix({ title: "My Post" })).toBe(': "My Post"');
  });

  it("is empty for a titleless post, so the sentence reads cleanly", () => {
    expect(getPostReferenceSuffix({ title: null })).toBe("");
    expect(`Ada liked your post${getPostReferenceSuffix({ title: null })}`).toBe(
      "Ada liked your post"
    );
  });
});

describe("getPostReferenceQuoted (for 'liked \"{value}\"' sentences)", () => {
  it("is the quoted title when present", () => {
    expect(getPostReferenceQuoted({ title: "My Post" })).toBe('"My Post"');
  });

  it("is 'your post' (unquoted) for a titleless post, never the literal word null", () => {
    expect(getPostReferenceQuoted({ title: null })).toBe("your post");
  });
});

describe("isLightweightPost", () => {
  it("is true for a new titleless post (content_kind resolves to post, no title)", () => {
    expect(isLightweightPost({ content_kind: "post", title: null })).toBe(true);
    expect(isLightweightPost({ type: "blog", title: null })).toBe(true);
  });

  it("is false for a legacy titled blog even though it resolves to post", () => {
    expect(isLightweightPost({ type: "blog", title: "My old blog post" })).toBe(false);
    expect(isLightweightPost({ content_kind: "post", title: "My old blog post" })).toBe(false);
  });

  it("is false for article/research kinds regardless of title", () => {
    expect(isLightweightPost({ type: "essay", title: "An essay" })).toBe(false);
    expect(isLightweightPost({ type: "research", title: "A paper" })).toBe(false);
    expect(isLightweightPost({ content_kind: "article", title: null })).toBe(false);
  });

  it("is false when the content kind can't be resolved at all", () => {
    expect(isLightweightPost({ type: null, title: null })).toBe(false);
    expect(isLightweightPost({ type: "op_ed", title: null })).toBe(false);
  });
});
