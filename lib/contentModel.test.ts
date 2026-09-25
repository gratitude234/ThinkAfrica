import { describe, expect, it } from "vitest";

import {
  composerSurfaceFor,
  CONTENT_KIND_LABELS,
  contentKindForTitle,
  contentKindRequiresTitle,
  getContentKindLabel,
  isContentKind,
  parseContentKind,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";

/**
 * The content model is two kinds and one rule.
 *
 * This file used to be 1,926 lines, because the model it tested had three
 * kinds, two article genres, a legacy `posts.type` column to fall back to, and
 * a set of rules about which kind needed formal review. Phase 2I removed all of
 * that from the product and from the database: `content_kind` is NOT NULL and
 * constrained to 'post' and 'article' (20260915000006), so there is no
 * fallback to test and no third kind to classify.
 *
 * What is left is worth testing precisely, because every write path and every
 * read surface routes through it.
 */

const KINDS: ContentKind[] = ["post", "article"];

describe("the content kinds", () => {
  it("admits exactly post and article", () => {
    for (const kind of KINDS) expect(isContentKind(kind)).toBe(true);
    for (const value of [
      "research",
      "essay",
      "policy_brief",
      "blog",
      "",
      "POST",
      null,
      undefined,
      1,
      {},
    ]) {
      expect(isContentKind(value), String(value)).toBe(false);
    }
  });

  it("parses untrusted input to a kind or to null, never throwing", () => {
    expect(parseContentKind("post")).toBe("post");
    expect(parseContentKind("article")).toBe("article");
    // The three the retired product used. A query string carrying one of them
    // resolves to null so a caller renders a default rather than crashing.
    expect(parseContentKind("research")).toBeNull();
    expect(parseContentKind("essay")).toBeNull();
    expect(parseContentKind("policy_brief")).toBeNull();
    expect(parseContentKind(undefined)).toBeNull();
    expect(parseContentKind({ content_kind: "post" })).toBeNull();
  });
});

describe("resolveContentKind", () => {
  it("reads content_kind and nothing else", () => {
    expect(resolveContentKind({ content_kind: "post" })).toBe("post");
    expect(resolveContentKind({ content_kind: "article" })).toBe("article");
  });

  it("does not fall back to a legacy type", () => {
    // The fallback this used to have is the whole point of its removal: every
    // row carries a canonical content_kind, and a second opinion derived from
    // `posts.type` would be a way for the two to disagree.
    const legacy = { content_kind: null, type: "essay" } as {
      content_kind: string | null;
    };
    expect(resolveContentKind(legacy)).toBeNull();
  });

  it("resolves an unknown or absent value to null", () => {
    expect(resolveContentKind({ content_kind: "research" })).toBeNull();
    expect(resolveContentKind({ content_kind: null })).toBeNull();
    expect(resolveContentKind({})).toBeNull();
  });
});

describe("contentKindForTitle", () => {
  it("a title makes it an Article, whichever screen it was written on", () => {
    expect(contentKindForTitle("On the price of maize")).toBe("article");
    expect(contentKindForTitle(null)).toBe("post");
    expect(contentKindForTitle(undefined)).toBe("post");
    expect(contentKindForTitle("")).toBe("post");
  });

  it("treats whitespace as no title", () => {
    for (const blank of [" ", "   ", "\t", "\n", " \t\n "]) {
      expect(contentKindForTitle(blank), JSON.stringify(blank)).toBe("post");
    }
  });

  it("agrees with contentKindRequiresTitle in both directions", () => {
    expect(contentKindRequiresTitle("article")).toBe(true);
    expect(contentKindRequiresTitle("post")).toBe(false);
    expect(contentKindRequiresTitle(null)).toBe(false);
    expect(contentKindRequiresTitle(undefined)).toBe(false);

    // The database states the same rule as
    // posts_title_required_unless_post_check. If these ever disagree, a write
    // the application permits is a write the database refuses.
    expect(contentKindRequiresTitle(contentKindForTitle("A title"))).toBe(true);
    expect(contentKindRequiresTitle(contentKindForTitle(null))).toBe(false);
  });
});

describe("labels", () => {
  it("names each kind once", () => {
    expect(CONTENT_KIND_LABELS).toEqual({ post: "Post", article: "Article" });
  });

  it("renders a label for every kind, and a safe fallback otherwise", () => {
    expect(getContentKindLabel("post")).toBe("Post");
    expect(getContentKindLabel("article")).toBe("Article");
    expect(getContentKindLabel(null)).toBe("Content");
    expect(getContentKindLabel(undefined)).toBe("Content");
  });

  it("carries no genre and no retired kind in any label", () => {
    const rendered = [
      ...Object.values(CONTENT_KIND_LABELS),
      getContentKindLabel(null),
    ].join(" ");
    for (const gone of ["Research", "Essay", "Policy Brief", "Citable", "Reviewed"]) {
      expect(rendered, gone).not.toContain(gone);
    }
  });
});

describe("composerSurfaceFor", () => {
  it("opens a titled piece in the Article editor, whatever was asked for", () => {
    expect(composerSurfaceFor({ title: "On the price of maize", requested: "post" })).toBe("article");
    expect(composerSurfaceFor({ title: "On the price of maize", requested: null })).toBe("article");
  });

  it("honours the writer's choice for an untitled piece", () => {
    expect(composerSurfaceFor({ title: "", requested: "article" })).toBe("article");
    expect(composerSurfaceFor({ title: "  ", requested: "post" })).toBe("post");
  });

  it("opens anything else as a Post", () => {
    for (const requested of [undefined, null, "", "research", "ARTICLE", ["article"]]) {
      expect(composerSurfaceFor({ title: null, requested }), JSON.stringify(requested)).toBe("post");
    }
  });
});
