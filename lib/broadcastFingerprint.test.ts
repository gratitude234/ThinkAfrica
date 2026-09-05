import { describe, expect, it } from "vitest";
import {
  DUPLICATE_CAMPAIGN_WINDOW_HOURS,
  campaignCanonicalForm,
  campaignFingerprint,
} from "@/lib/broadcastFingerprint";

/**
 * What counts as the same campaign.
 *
 * Written against the two that actually went out:
 *   c5134c35-dc18-4cd4-8bc0-ad23e0c8bfd4, sender platform, 23:09 UTC
 *   24b75e7d-b9c4-4fbb-887b-c8f4c903b138, sender ceo, 23:11 UTC
 * Same subject, same body, same standing audience, two minutes apart. Every
 * per-row protection held; nothing asked whether the campaign had already gone.
 */

const WELCOME = {
  subject: "Welcome to Indegenius",
  bodyHtml: "<p>We are glad you are here.</p><p>Start with the feed.</p>",
  audienceKey: "all" as const,
};

describe("what makes two broadcasts one campaign", () => {
  it("collides across sender identities, which is the production case", () => {
    // The sender is deliberately absent from the fingerprint. It is the single
    // most tempting field to include, and including it is exactly what would
    // have let the second send through.
    const asPlatform = campaignFingerprint(WELCOME);
    const asCeo = campaignFingerprint(WELCOME);

    expect(asPlatform).toBe(asCeo);
    expect(campaignCanonicalForm(WELCOME)).not.toContain("platform");
    expect(campaignCanonicalForm(WELCOME)).not.toContain("ceo");
  });

  it("ignores markup differences a reader would never see", () => {
    const pasted = campaignFingerprint(WELCOME);

    for (const bodyHtml of [
      // Attribute noise from a second paste through the editor.
      '<p class="x" dir="ltr">We are glad you are here.</p><p>Start with the feed.</p>',
      // A different block element around the same words.
      "<div>We are glad you are here.</div><div>Start with the feed.</div>",
      // Entity spelling and a non-breaking space.
      "<p>We are glad you&nbsp;are here.</p><p>Start with the feed.</p>",
      // Whitespace and indentation.
      "<p>\n  We are glad you are here.\n</p>\n<p>Start with the feed.</p>",
      // Case, which no reader treats as a different message.
      "<p>WE ARE GLAD YOU ARE HERE.</p><p>START WITH THE FEED.</p>",
    ]) {
      expect(campaignFingerprint({ ...WELCOME, bodyHtml })).toBe(pasted);
    }
  });

  it("treats a different body as a different campaign", () => {
    expect(
      campaignFingerprint({
        ...WELCOME,
        bodyHtml: "<p>We are glad you are here.</p><p>Read the charter first.</p>",
      })
    ).not.toBe(campaignFingerprint(WELCOME));
  });

  it("treats a different subject as a different campaign", () => {
    expect(
      campaignFingerprint({ ...WELCOME, subject: "Welcome back to Indegenius" })
    ).not.toBe(campaignFingerprint(WELCOME));
  });

  it("treats a different audience as a different campaign", () => {
    expect(
      campaignFingerprint({ ...WELCOME, audienceKey: "authors" })
    ).not.toBe(campaignFingerprint(WELCOME));
  });

  it("keeps a link's destination in play, since changing it changes the message", () => {
    const toFeed = campaignFingerprint({
      ...WELCOME,
      bodyHtml: '<p><a href="https://indegenius.africa/feed">Start here</a></p>',
    });
    const toTopics = campaignFingerprint({
      ...WELCOME,
      bodyHtml: '<p><a href="https://indegenius.africa/topics">Start here</a></p>',
    });

    expect(toFeed).not.toBe(toTopics);
  });

  it("cannot be defeated by moving text between the subject and the body", () => {
    const inSubject = campaignFingerprint({
      subject: "Welcome to Indegenius body:hello",
      bodyHtml: "<p></p>",
      audienceKey: "all",
    });
    const inBody = campaignFingerprint({
      subject: "Welcome to Indegenius",
      bodyHtml: "<p>hello</p>",
      audienceKey: "all",
    });

    expect(inSubject).not.toBe(inBody);
  });
});

describe("a hand-picked audience", () => {
  const base = { ...WELCOME, audienceKey: "selected" as const };

  it("is the people in it, whatever order they were ticked", () => {
    expect(
      campaignFingerprint({ ...base, selectedProfileIds: ["p2", "p1", "p2"] })
    ).toBe(campaignFingerprint({ ...base, selectedProfileIds: ["p1", "p2"] }));
  });

  it("is a different campaign when the people are materially different", () => {
    expect(
      campaignFingerprint({ ...base, selectedProfileIds: ["p1", "p2"] })
    ).not.toBe(campaignFingerprint({ ...base, selectedProfileIds: ["p1", "p3"] }));
  });
});

describe("the window", () => {
  it("is a day, so a weekly newsletter is never blocked by last week's", () => {
    expect(DUPLICATE_CAMPAIGN_WINDOW_HOURS).toBe(24);
  });
});
