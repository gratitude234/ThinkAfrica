import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  generateExcerpt,
  getPostMetaDescription,
  sanitizePostExcerpt,
  stripHtmlToText,
} from "./utils";

describe("sanitizePostExcerpt", () => {
  it("fixes the production leak of an encoded non-breaking space", () => {
    expect(sanitizePostExcerpt("She was 7 years old.&nbsp; It was&hellip;")).toBe(
      "She was 7 years old. It was…"
    );
  });

  it("decodes the named entities an editor body produces", () => {
    expect(sanitizePostExcerpt("Law &amp; Justice")).toBe("Law & Justice");
    expect(sanitizePostExcerpt("&quot;Quoted&quot;")).toBe('"Quoted"');
    expect(sanitizePostExcerpt("It&#39;s hers")).toBe("It's hers");
    expect(sanitizePostExcerpt("It&apos;s hers")).toBe("It's hers");
    expect(sanitizePostExcerpt("&lsquo;a&rsquo; and &ldquo;b&rdquo;")).toBe(
      "‘a’ and “b”"
    );
  });

  it("decodes decimal and hexadecimal numeric entities", () => {
    expect(sanitizePostExcerpt("caf&#233;")).toBe("café");
    expect(sanitizePostExcerpt("caf&#xE9;")).toBe("café");
    expect(sanitizePostExcerpt("caf&#XE9;")).toBe("café");
    expect(sanitizePostExcerpt("100&#37; sure")).toBe("100% sure");
  });

  it("leaves an unknown or malformed entity as written", () => {
    expect(sanitizePostExcerpt("AT&T tomorrow")).toBe("AT&T tomorrow");
    expect(sanitizePostExcerpt("&notarealentity; here")).toBe(
      "&notarealentity; here"
    );
    expect(sanitizePostExcerpt("&#999999999;")).toBe("&#999999999;");
  });

  it("removes markup without executing or re-parsing it", () => {
    expect(
      sanitizePostExcerpt("<p>Hello <strong>there</strong></p>")
    ).toBe("Hello there");
    expect(sanitizePostExcerpt("<!-- draft note -->Visible")).toBe("Visible");
    expect(
      sanitizePostExcerpt("<img src=x onerror=alert(1)>Ready")
    ).toBe("Ready");
  });

  it("does not turn escaped markup back into markup", () => {
    // The decoded tags come off and their body survives as plain prose. That
    // is the whole guarantee: the result is a string React prints, never
    // markup a parser could act on.
    expect(
      sanitizePostExcerpt("&lt;script&gt;alert(1)&lt;/script&gt; after")
    ).toBe("alert(1) after");
    // A doubly escaped entity decodes exactly once, so stored text that
    // describes an entity keeps describing it.
    expect(sanitizePostExcerpt("&amp;nbsp; is a space")).toBe(
      "&nbsp; is a space"
    );
    expect(sanitizePostExcerpt("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
  });

  it("collapses repeated and non-breaking whitespace into single spaces", () => {
    expect(sanitizePostExcerpt("one   two\n\n\tthree")).toBe("one two three");
    expect(sanitizePostExcerpt("one&nbsp;&nbsp;&nbsp;two")).toBe("one two");
    expect(sanitizePostExcerpt("  padded  ")).toBe("padded");
    expect(sanitizePostExcerpt("zero​width")).toBe("zerowidth");
  });

  it("preserves ordinary punctuation, inequalities and non-Latin text", () => {
    expect(sanitizePostExcerpt("Yes: it works, mostly (about 80%).")).toBe(
      "Yes: it works, mostly (about 80%)."
    );
    expect(sanitizePostExcerpt("5 < 10 > 3")).toBe("5 < 10 > 3");
    expect(sanitizePostExcerpt("Ìbàdàn, Côte d'Ivoire, 日本語")).toBe(
      "Ìbàdàn, Côte d'Ivoire, 日本語"
    );
    expect(sanitizePostExcerpt("A—B, C…D")).toBe("A—B, C…D");
  });

  it("keeps the editor field prefix strip and the empty-to-null contract", () => {
    expect(sanitizePostExcerpt("Abstract: the argument")).toBe("the argument");
    expect(sanitizePostExcerpt("<p>&nbsp;</p>")).toBeNull();
    expect(sanitizePostExcerpt("")).toBeNull();
    expect(sanitizePostExcerpt(null)).toBeNull();
    expect(sanitizePostExcerpt(undefined)).toBeNull();
  });

  it("is idempotent, so a second surface can safely normalize again", () => {
    const once = sanitizePostExcerpt("<p>Law &amp; order.&nbsp; Then?</p>");
    expect(once).toBe("Law & order. Then?");
    expect(sanitizePostExcerpt(once)).toBe(once);
  });
});

describe("decodeHtmlEntities and stripHtmlToText", () => {
  it("decodes in a single pass", () => {
    expect(decodeHtmlEntities("&amp;amp;")).toBe("&amp;");
  });

  it("rejects control characters that would corrupt a line", () => {
    expect(decodeHtmlEntities("a&#0;b")).toBe("a&#0;b");
    expect(decodeHtmlEntities("a&#x1F;b")).toBe("a&#x1F;b");
  });

  it("returns plain prose from stored post HTML", () => {
    expect(
      stripHtmlToText("<h2>Title</h2><p>Body&nbsp;text &amp; more</p>")
    ).toBe("Title Body text & more");
  });
});

describe("generateExcerpt", () => {
  it("normalizes entities before truncating", () => {
    expect(generateExcerpt("<p>Law &amp; order&nbsp;now</p>")).toBe(
      "Law & order now"
    );
  });

  it("truncates on a word boundary", () => {
    const excerpt = generateExcerpt("alpha beta gamma delta", 12);
    expect(excerpt).toBe("alpha beta ...");
  });
});

describe("getPostMetaDescription", () => {
  it("prefers a normalized excerpt over content", () => {
    expect(
      getPostMetaDescription({
        excerpt: "A&nbsp;summary &amp; more",
        content: "<p>Body</p>",
        fallback: "Fallback",
      })
    ).toBe("A summary & more");
  });

  it("falls back through content to the supplied string", () => {
    expect(
      getPostMetaDescription({
        excerpt: "<p>&nbsp;</p>",
        content: "<p>Body &amp; soul</p>",
        fallback: "Fallback",
      })
    ).toBe("Body & soul");
    expect(
      getPostMetaDescription({ excerpt: null, content: null, fallback: "Fallback" })
    ).toBe("Fallback");
  });
});
