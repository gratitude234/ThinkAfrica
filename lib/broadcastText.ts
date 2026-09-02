import { BRAND_PROMISE, BRAND_TAGLINE } from "@/lib/brand";

/**
 * The plain-text half of a broadcast.
 *
 * Resend wants both parts, and a broadcast with no text alternative reads as
 * bulk mail to the filters that matter. The composer only produces paragraphs,
 * headings, lists, links and emphasis, so a small converter covers all of it
 * rather than pulling in a parser.
 */

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function decodeEntities(value: string) {
  return value.replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
    (match) => ENTITIES[match] ?? match
  );
}

export function htmlToPlainText(html: string) {
  const withMarkers = html
    // A link is useless in plain text unless the address travels with it.
    .replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, label: string) => {
        const text = label.replace(/<[^>]*>/g, "").trim();
        if (!text) return href;
        return text === href ? href : `${text} (${href})`;
      }
    )
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|h2|h3|ul|ol|li|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  return decodeEntities(withMarkers)
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function broadcastPlainText(input: {
  subject: string;
  bodyHtml: string;
  footerNote: string;
  /** Resend's merge tag, or the inert sentence a test send uses instead. */
  unsubscribeLine?: string;
}) {
  return [
    input.subject,
    "",
    htmlToPlainText(input.bodyHtml),
    "",
    BRAND_PROMISE,
    BRAND_TAGLINE,
    "",
    input.footerNote,
    ...(input.unsubscribeLine ? [input.unsubscribeLine] : []),
  ].join("\n");
}
