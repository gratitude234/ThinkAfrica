/**
 * Typographic decisions about an article body that depend on its content
 * rather than its metadata.
 *
 * Kept out of the post page so they can be tested directly: the rules are all
 * edge cases, and every one of them came from a body that looked fine until it
 * didn't.
 */

/**
 * How long an opening paragraph has to be before it can carry a 5rem floated
 * capital without the following text wrapping raggedly around it.
 */
export const DROP_CAP_MIN_CHARACTERS = 180;

function paragraphText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** The first paragraph with words in it, skipping empty editor artifacts. */
export function firstMeaningfulParagraph(content: string): string | null {
  for (const match of content.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = paragraphText(match[1]);
    if (text) return text;
  }
  return null;
}

/**
 * Whether the body earns a drop cap.
 *
 * Deliberately not gated on article_format. A generic Article resolves to a
 * null format, so gating on essay/policy_brief silently removed the cap from
 * the most common kind of post there is. The length and first-character tests
 * are what actually prevent the bad settings: a one-sentence lede getting a
 * capital taller than the paragraph beside it, or an opening quotation mark or
 * numeral being set at 5rem.
 */
export function earnsDropCap(content: string): boolean {
  const text = firstMeaningfulParagraph(content);
  if (!text) return false;
  if (text.length < DROP_CAP_MIN_CHARACTERS) return false;
  return /^\p{Letter}/u.test(text);
}

/**
 * Drops empty leading paragraphs from the body.
 *
 * The editor emits `<p></p>` and `<p><br></p>` readily. Without this the guard
 * above and the CSS disagree: `earnsDropCap` skips an empty opener to find the
 * real one, but `p:first-of-type` does not, so the cap would be set on a
 * paragraph with no letter in it and silently vanish. Removing the node makes
 * both agree, and takes a stray blank line off the top of the article.
 */
export function stripLeadingEmptyParagraphs(content: string): string {
  let out = content.trimStart();
  for (;;) {
    const match = out.match(/^<p[^>]*>([\s\S]*?)<\/p>\s*/i);
    if (!match || paragraphText(match[1])) return out;
    out = out.slice(match[0].length);
  }
}
