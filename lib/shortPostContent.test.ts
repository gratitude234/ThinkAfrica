import { describe, expect, it } from "vitest";
import {
  countShortPostCharacters,
  deriveShortPostExcerpt,
  isShortPostBodyValid,
  normalizeShortPostText,
  SHORT_POST_MAX_CHARACTERS,
  shortPostHtmlToText,
} from "@/lib/shortPostContent";
import { buildShortPostHtml } from "@/lib/shortPostHtml";

describe("normalizeShortPostText / countShortPostCharacters", () => {
  it("trims outer whitespace but preserves internal spacing", () => {
    expect(normalizeShortPostText("  hello   world  ")).toBe("hello   world");
  });

  it("collapses CRLF to LF", () => {
    expect(normalizeShortPostText("line one\r\nline two")).toBe("line one\nline two");
  });

  it("counts normalized user-visible characters, not generated HTML", () => {
    const body = "Check https://example.com out";
    expect(countShortPostCharacters(body)).toBe(body.length);
    expect(buildShortPostHtml(body).length).toBeGreaterThan(body.length);
  });
});

describe("isShortPostBodyValid (server validation surface)", () => {
  it("rejects an empty post", () => {
    expect(isShortPostBodyValid("")).toBe(false);
  });

  it("rejects a whitespace-only post", () => {
    expect(isShortPostBodyValid("   \n\n   ")).toBe(false);
  });

  it("accepts exactly the maximum character count", () => {
    const body = "a".repeat(SHORT_POST_MAX_CHARACTERS);
    expect(countShortPostCharacters(body)).toBe(SHORT_POST_MAX_CHARACTERS);
    expect(isShortPostBodyValid(body)).toBe(true);
  });

  it("rejects one character over the maximum", () => {
    const body = "a".repeat(SHORT_POST_MAX_CHARACTERS + 1);
    expect(isShortPostBodyValid(body)).toBe(false);
  });

  it("accepts an ordinary short post", () => {
    expect(isShortPostBodyValid("A quick thought.")).toBe(true);
  });
});

describe("buildShortPostHtml", () => {
  it("escapes angle brackets, quotes, and ampersands so markup cannot execute", () => {
    const html = buildShortPostHtml('<script>alert("x")</script> & <img onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("turns blank-line-separated blocks into paragraphs", () => {
    const html = buildShortPostHtml("First paragraph.\n\nSecond paragraph.");
    expect(html).toBe("<p>First paragraph.</p><p>Second paragraph.</p>");
  });

  it("preserves single newlines within a paragraph as a line break", () => {
    // sanitize-html re-serializes <br> as the self-closing <br />; both
    // are the same element, so match loosely rather than byte-for-byte.
    const html = buildShortPostHtml("Line one\nLine two");
    expect(html).toMatch(/^<p>Line one<br\s*\/?>Line two<\/p>$/);
  });

  it("turns http(s) URLs into safe clickable anchors", () => {
    const html = buildShortPostHtml("See https://example.com/path for more.");
    expect(html).toContain('<a href="https://example.com/path"');
    expect(html).toContain(">https://example.com/path</a>");
  });

  it("does not turn javascript: or data: URLs into anchors", () => {
    const html = buildShortPostHtml("click javascript:alert(1) or data:text/html,x");
    expect(html).not.toContain("<a ");
    expect(html).toContain("javascript:alert(1)");
    expect(html).toContain("data:text/html,x");
  });

  it("does not let a typed anchor tag become a real, live anchor", () => {
    const html = buildShortPostHtml('<a href="javascript:alert(1)">click me</a>');
    // The literal "<a" the user typed must never survive as a real tag --
    // it should only appear escaped (&lt;a), i.e. inert visible text.
    expect(html).not.toMatch(/<a\s/);
    expect(html).toContain("&lt;a href=");
  });
});

describe("deriveShortPostExcerpt", () => {
  it("returns null for empty input", () => {
    expect(deriveShortPostExcerpt("   ")).toBeNull();
  });

  it("returns the full text when under the limit", () => {
    expect(deriveShortPostExcerpt("Short post")).toBe("Short post");
  });

  it("truncates on a word boundary and appends an ellipsis when over the limit", () => {
    const long = "word ".repeat(100).trim();
    const excerpt = deriveShortPostExcerpt(long, 50);
    expect(excerpt).not.toBeNull();
    expect(excerpt!.length).toBeLessThanOrEqual(53);
    expect(excerpt!.endsWith("...")).toBe(true);
  });
});

describe("shortPostHtmlToText (round-trip for editing)", () => {
  it("round-trips a multi-paragraph body with a link", () => {
    const original = "First line\nSecond line\n\nSee https://example.com for more.";
    const html = buildShortPostHtml(original);
    const restored = shortPostHtmlToText(html);
    expect(restored).toBe(original);
  });

  it("round-trips escaped special characters", () => {
    const original = 'Use "quotes" & <brackets> safely.';
    const html = buildShortPostHtml(original);
    const restored = shortPostHtmlToText(html);
    expect(restored).toBe(original);
  });
});
