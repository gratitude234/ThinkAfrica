import { describe, expect, it } from "vitest";
import {
  RESEND_UNSUBSCRIBE_MERGE_TAG,
  broadcastBodyWordCount,
  buildBroadcastEmailHtml,
  isBroadcastBodyEmpty,
  renderBroadcastBodyHtml,
  unsubscribeFooterText,
} from "@/lib/broadcastEmail";

describe("renderBroadcastBodyHtml", () => {
  it("inlines styles on the blocks the composer can produce", () => {
    const html = renderBroadcastBodyHtml("<p>Hello</p><h2>Heading</h2>");

    expect(html).toContain('<p style="margin:0 0 18px;');
    expect(html).toContain('<h2 style="margin:30px 0 12px;');
  });

  it("keeps the attributes a link already carries", () => {
    const html = renderBroadcastBodyHtml(
      '<p>Read the <a href="https://indegenius.africa/review" rel="noopener noreferrer">Review</a>.</p>'
    );

    expect(html).toContain('href="https://indegenius.africa/review"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("color:#073929");
  });

  it("styles both list kinds and their items", () => {
    const html = renderBroadcastBodyHtml("<ul><li>One</li></ul><ol><li>Two</li></ol>");

    expect(html).toContain("<ul style=");
    expect(html).toContain("<ol style=");
    expect(html.match(/<li style=/g)).toHaveLength(2);
  });

  it("leaves inline emphasis alone", () => {
    const html = renderBroadcastBodyHtml("<p><strong>Bold</strong> and <em>italic</em></p>");

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("does not touch closing tags", () => {
    expect(renderBroadcastBodyHtml("<p>Text</p>")).toContain("</p>");
  });
});

describe("body emptiness", () => {
  it("treats an untouched composer as empty", () => {
    expect(isBroadcastBodyEmpty("<p></p>")).toBe(true);
    expect(isBroadcastBodyEmpty("<p>&nbsp;</p>")).toBe(true);
  });

  it("treats any real text as content", () => {
    expect(isBroadcastBodyEmpty("<p>A note to the community.</p>")).toBe(false);
  });

  it("counts words across blocks", () => {
    expect(broadcastBodyWordCount("<p>One two</p><p>three</p>")).toBe(3);
    expect(broadcastBodyWordCount("<p></p>")).toBe(0);
  });
});

describe("buildBroadcastEmailHtml", () => {
  const base = {
    subject: "Building the next chapter of Indegenius",
    previewText: "What changes this term.",
    bodyHtml: "<p>A note to the community.</p>",
  };

  it("pours the body into the Indegenius email shell", () => {
    const html = buildBroadcastEmailHtml({ ...base, senderKey: "platform" });

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Building the next chapter of Indegenius");
    expect(html).toContain("A note to the community.");
    expect(html).toContain("Africa&#39;s First Intellectual Social Network");
  });

  it("uses the preview text as the inbox preheader", () => {
    const html = buildBroadcastEmailHtml({ ...base, senderKey: "platform" });

    expect(html).toContain("What changes this term.");
  });

  it("falls back to the subject when no preview text is set", () => {
    const html = buildBroadcastEmailHtml({
      ...base,
      previewText: "   ",
      senderKey: "platform",
    });

    expect(html).toContain("Building the next chapter of Indegenius");
  });

  it("carries the unmonitored footer for the platform sender", () => {
    const html = buildBroadcastEmailHtml({ ...base, senderKey: "platform" });

    expect(html).toContain("This mailbox is not monitored");
  });

  it("drops that footer for a replyable identity", () => {
    const html = buildBroadcastEmailHtml({ ...base, senderKey: "ceo" });

    expect(html).not.toContain("This mailbox is not monitored");
  });
});

describe("the unsubscribe footer", () => {
  const base = {
    subject: "Building the next chapter of Indegenius",
    previewText: "What changes this term.",
    bodyHtml: "<p>Something worth reading.</p>",
    senderKey: "platform" as const,
  };

  it("carries Resend's merge tag in a real broadcast", () => {
    // Written in explicitly rather than left to Resend's own appended footer,
    // so the wording and placement are ours and the preview shows them.
    const html = buildBroadcastEmailHtml({ ...base, unsubscribe: "broadcast" });

    expect(html).toContain(RESEND_UNSUBSCRIBE_MERGE_TAG);
    expect(html).toContain("Unsubscribe from Indegenius announcements");
  });

  it("writes the tag inert for a test send", () => {
    // A test goes through the transactional API, which substitutes nothing.
    // Shipping the raw braces to an admin's inbox would just look broken.
    const html = buildBroadcastEmailHtml({ ...base, unsubscribe: "test" });

    expect(html).not.toContain(RESEND_UNSUBSCRIBE_MERGE_TAG);
    expect(html).toContain("Unsubscribe from Indegenius announcements");
  });

  it("writes it inert in the composer preview too", () => {
    // Nothing in the admin has a recipient to resolve the link against.
    const html = buildBroadcastEmailHtml({ ...base, unsubscribe: "preview" });

    expect(html).not.toContain(RESEND_UNSUBSCRIBE_MERGE_TAG);
  });

  it("defaults to inert rather than to a live merge tag", () => {
    // If a caller forgets, the safe mistake is a dead link in a preview, not a
    // literal {{{RESEND_UNSUBSCRIBE_URL}}} in somebody's inbox.
    const html = buildBroadcastEmailHtml(base);

    expect(html).not.toContain(RESEND_UNSUBSCRIBE_MERGE_TAG);
  });

  it("offers the same line in plain text", () => {
    expect(unsubscribeFooterText("broadcast")).toContain(
      RESEND_UNSUBSCRIBE_MERGE_TAG
    );
    expect(unsubscribeFooterText("test")).not.toContain(
      RESEND_UNSUBSCRIBE_MERGE_TAG
    );
  });

  it("keeps the sender's own footer alongside it", () => {
    const html = buildBroadcastEmailHtml({ ...base, unsubscribe: "broadcast" });

    expect(html).toContain("This mailbox is not monitored");
    expect(html).toContain("Unsubscribe from Indegenius announcements");
  });
});
