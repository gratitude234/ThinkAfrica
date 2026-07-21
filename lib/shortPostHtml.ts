import "server-only";

/**
 * The sanitize-dependent half of the short-Post content pipeline (see
 * lib/shortPostContent.ts). Split into its own module because it pulls in
 * sanitizePostHtml.ts (server-only): anything that imports it can never be
 * bundled into a Client Component, whereas the pure text helpers in
 * lib/shortPostContent.ts need to stay importable from the composer's
 * client-side character counter.
 */

import { sanitizePostHtml } from "@/lib/sanitizePostHtml";
import { normalizeShortPostText } from "@/lib/shortPostContent";

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes a line of plain text and turns any http(s) URLs within it into
 * anchors. Only http(s) URLs are ever recognized -- javascript:/data:/etc
 * typed as literal text stay literal escaped text, never becoming a live
 * anchor. sanitizePostHtml() is still run over the final output as a
 * second, independent layer of defense (it also fills in target/rel).
 */
function linkifyEscaped(line: string): string {
  let result = "";
  let lastIndex = 0;

  for (const match of line.matchAll(URL_PATTERN)) {
    const url = match[0];
    const start = match.index ?? 0;
    result += escapeHtml(line.slice(lastIndex, start));
    const safeUrl = escapeHtml(url);
    result += `<a href="${safeUrl}">${safeUrl}</a>`;
    lastIndex = start + url.length;
  }

  result += escapeHtml(line.slice(lastIndex));
  return result;
}

/**
 * Converts a plain-text Post body into sanitized HTML: blank-line-
 * separated blocks become paragraphs, single newlines within a block
 * become <br>, and http(s) URLs become safe clickable anchors. Everything
 * else is HTML-escaped, so user-entered markup is inert text, not markup.
 */
export function buildShortPostHtml(raw: string): string {
  const normalized = normalizeShortPostText(raw);
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const html = paragraphs
    .map((block) => `<p>${linkifyEscaped(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return sanitizePostHtml(html);
}
