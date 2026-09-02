import type { EmailSenderKey } from "@/lib/emailSenders";
import { renderEmailShell } from "@/lib/emailShell";

/**
 * Turns composer output into email-safe HTML.
 *
 * The composer emits semantic tags. Mail clients ignore most stylesheets, so
 * every block gets its styling inlined here before it is poured into the
 * Indegenius email shell. The tag list is exactly what the composer toolbar can
 * produce, which is why a lookup table is enough: there is no arbitrary markup
 * to defend against, because the editor never lets an admin write any.
 */
const BLOCK_STYLES: Record<string, string> = {
  p: "margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;",
  h2: "margin:30px 0 12px;font-size:19px;line-height:1.35;font-weight:700;color:#111827;",
  h3: "margin:26px 0 10px;font-size:16px;line-height:1.4;font-weight:700;color:#111827;",
  ul: "margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;",
  ol: "margin:0 0 18px;padding-left:20px;font-size:15px;line-height:1.7;color:#374151;",
  li: "margin:0 0 8px;",
  a: "color:#073929;text-decoration:underline;",
};

const STYLED_TAGS = Object.keys(BLOCK_STYLES).join("|");

export function renderBroadcastBodyHtml(html: string) {
  return html.replace(
    new RegExp(`<(${STYLED_TAGS})((?:\\s[^>]*)?)>`, "gi"),
    (match, tag: string, attributes: string) => {
      const style = BLOCK_STYLES[tag.toLowerCase()];
      if (!style) return match;
      // The composer never emits an inline style of its own, so there is
      // nothing here to merge with or overwrite.
      return `<${tag}${attributes} style="${style}">`;
    }
  );
}

/** An empty composer still produces one empty paragraph, which is not content. */
export function isBroadcastBodyEmpty(html: string) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
}

export function broadcastBodyWordCount(html: string) {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

/**
 * Resend substitutes this in a broadcast, and only in a broadcast. It is
 * written in explicitly rather than left to Resend's own appended footer, so
 * the wording, the placement and the styling are ours and we can see in the
 * preview exactly what a recipient will be offered.
 *
 * The triple braces are Resend's own syntax for an unescaped substitution.
 */
export const RESEND_UNSUBSCRIBE_MERGE_TAG = "{{{RESEND_UNSUBSCRIBE_URL}}}";

const UNSUBSCRIBE_LABEL = "Unsubscribe from Indegenius announcements";

/**
 * How the unsubscribe line is rendered.
 *
 * "broadcast" emits Resend's merge tag, which only a real broadcast resolves.
 * "test" and "preview" emit the same sentence with the link inert, because a
 * test email goes through the transactional send API, which does not
 * substitute merge tags and would post the literal braces to an admin's inbox.
 */
export type BroadcastUnsubscribeMode = "broadcast" | "test" | "preview";

function unsubscribeFooterHtml(mode: BroadcastUnsubscribeMode) {
  if (mode === "broadcast") {
    return `<a href="${RESEND_UNSUBSCRIBE_MERGE_TAG}" style="color:#073929;text-decoration:underline;">${UNSUBSCRIBE_LABEL}</a>`;
  }
  return `<span style="color:#9ca3af;">${UNSUBSCRIBE_LABEL} · the link is live only in the real send</span>`;
}

export function unsubscribeFooterText(mode: BroadcastUnsubscribeMode) {
  if (mode === "broadcast") {
    return `${UNSUBSCRIBE_LABEL}: ${RESEND_UNSUBSCRIBE_MERGE_TAG}`;
  }
  return `${UNSUBSCRIBE_LABEL}. The link is live only in the real send.`;
}

/**
 * The exact HTML a recipient receives. The preview renders this string, so an
 * admin is looking at the production email rather than a mock of it.
 */
export function buildBroadcastEmailHtml(input: {
  subject: string;
  previewText: string;
  bodyHtml: string;
  senderKey: EmailSenderKey;
  unsubscribe?: BroadcastUnsubscribeMode;
}) {
  return renderEmailShell({
    preview: input.previewText.trim() || input.subject,
    title: input.subject,
    bodyHtml: renderBroadcastBodyHtml(input.bodyHtml),
    footerHtml: unsubscribeFooterHtml(input.unsubscribe ?? "preview"),
    sender: input.senderKey,
  });
}
