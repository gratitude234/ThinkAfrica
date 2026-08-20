import { describe, expect, it } from "vitest";
import {
  earnsDropCap,
  firstMeaningfulParagraph,
  stripLeadingEmptyParagraphs,
} from "./articleTypography";

const LONG_OPENER =
  "One thing we've all noticed, and I bet we all noticed on our roads is that we barely see new cars or cars that came out immediately that year, an average car on the road in Nigeria is at least over ten years old.";

describe("earnsDropCap", () => {
  it("sets a cap on a long opening paragraph", () => {
    expect(earnsDropCap(`<p>${LONG_OPENER}</p>`)).toBe(true);
  });

  it("skips a lede too short to wrap around the capital", () => {
    expect(
      earnsDropCap("<p>Every Biochemistry student should read this:</p>")
    ).toBe(false);
  });

  it("skips an opening quotation mark or numeral", () => {
    expect(earnsDropCap(`<p>"${LONG_OPENER}"</p>`)).toBe(false);
    expect(earnsDropCap(`<p>2026 ${LONG_OPENER}</p>`)).toBe(false);
  });

  it("looks past the empty paragraphs the editor leaves at the top", () => {
    // Taking the first <p> blindly measured the empty node and dropped the cap
    // from an article that had earned it.
    expect(earnsDropCap(`<p></p><p>${LONG_OPENER}</p>`)).toBe(true);
    expect(earnsDropCap(`<p><br></p><p>${LONG_OPENER}</p>`)).toBe(true);
    expect(earnsDropCap(`<p>&nbsp;</p><p>${LONG_OPENER}</p>`)).toBe(true);
  });

  it("counts the words, not the markup around them", () => {
    const withMarkup = `<p><strong>One</strong> thing ${LONG_OPENER.slice(9)}</p>`;
    expect(earnsDropCap(withMarkup)).toBe(true);
  });

  it("returns false for a body with no paragraphs at all", () => {
    expect(earnsDropCap("<h2>A heading</h2>")).toBe(false);
    expect(earnsDropCap("")).toBe(false);
  });
});

describe("stripLeadingEmptyParagraphs", () => {
  it("removes empty openers so CSS first-of-type finds the same paragraph", () => {
    expect(stripLeadingEmptyParagraphs(`<p><br></p><p>${LONG_OPENER}</p>`)).toBe(
      `<p>${LONG_OPENER}</p>`
    );
  });

  it("removes a run of them", () => {
    expect(
      stripLeadingEmptyParagraphs(`<p></p>\n<p><br></p><p>&nbsp;</p><p>Real.</p>`)
    ).toBe("<p>Real.</p>");
  });

  it("leaves a body that already opens on words alone", () => {
    const html = `<p>${LONG_OPENER}</p><p></p>`;
    expect(stripLeadingEmptyParagraphs(html)).toBe(html);
  });

  it("does not strip an empty paragraph that is not leading", () => {
    const html = "<p>First.</p><p></p><p>Third.</p>";
    expect(stripLeadingEmptyParagraphs(html)).toBe(html);
  });

  it("leaves a body that opens on something other than a paragraph", () => {
    const html = "<h2>Heading</h2><p>Body.</p>";
    expect(stripLeadingEmptyParagraphs(html)).toBe(html);
  });
});

describe("firstMeaningfulParagraph", () => {
  it("returns the text of the first paragraph with words in it", () => {
    expect(firstMeaningfulParagraph("<p> </p><p>  Real text.  </p>")).toBe(
      "Real text."
    );
  });

  it("returns null when nothing qualifies", () => {
    expect(firstMeaningfulParagraph("<p></p><p><br></p>")).toBeNull();
  });
});
