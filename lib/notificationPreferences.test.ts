import { describe, expect, it } from "vitest";
import {
  IN_APP_PREF_DEFAULTS,
  IN_APP_PREF_GROUPS,
  assertMutableTypes,
  mutedNotificationTypes,
} from "./notificationPreferences";
import { describeNotificationType } from "./notificationCatalog";

describe("what may be muted", () => {
  it("never lets an actionable notification be switched off", () => {
    // The load-bearing guarantee of this module. If someone later widens a group
    // to include, say, revision_requested or account_suspended, this fails rather
    // than shipping a way to silence a suspension notice.
    expect(() => assertMutableTypes()).not.toThrow();
  });

  it("keeps trust-and-safety notices out of every group", () => {
    const mutable = IN_APP_PREF_GROUPS.flatMap((group) => group.types);

    for (const type of [
      "account_suspended",
      "moderation_post_removed",
      "moderation_comment_hidden",
      "revision_requested",
      "review_assigned",
      "co_author_invite",
      "debate_invitation",
      "response_post",
      "opportunity_inquiry",
    ]) {
      expect(mutable, type).not.toContain(type);
    }
  });

  it("only names types the catalog knows about", () => {
    for (const group of IN_APP_PREF_GROUPS) {
      for (const type of group.types) {
        // A typo here would silently mute nothing.
        expect(describeNotificationType(type).label, type).not.toBe(
          "New notification"
        );
      }
    }
  });

  it("defaults every group to on", () => {
    for (const group of IN_APP_PREF_GROUPS) {
      expect(IN_APP_PREF_DEFAULTS[group.key], group.key).toBe(true);
    }
  });
});

describe("mutedNotificationTypes", () => {
  it("mutes nothing for a reader who has never opened settings", () => {
    expect(mutedNotificationTypes(null)).toEqual([]);
    expect(mutedNotificationTypes(undefined)).toEqual([]);
    expect(mutedNotificationTypes({})).toEqual([]);
  });

  it("treats an absent key as on, so new types deliver by default", () => {
    // Someone who saved preferences before a group existed must not find that
    // group silently muted when it ships.
    expect(mutedNotificationTypes({ inapp_likes: true })).toEqual([]);
  });

  it("only mutes on an explicit false", () => {
    expect(mutedNotificationTypes({ inapp_likes: false })).toEqual(["like"]);
    // Truthy-but-not-true values are not an opt-out.
    expect(mutedNotificationTypes({ inapp_likes: 0 })).toEqual([]);
    expect(mutedNotificationTypes({ inapp_likes: "no" })).toEqual([]);
  });

  it("expands a group to all of its types", () => {
    expect(mutedNotificationTypes({ inapp_follows: false }).sort()).toEqual([
      "author_subscribed",
      "follow",
    ]);
  });

  it("combines several muted groups", () => {
    const muted = mutedNotificationTypes({
      inapp_likes: false,
      inapp_follows: false,
    });

    expect(muted.sort()).toEqual([
      "author_subscribed",
      "follow",
      "like",
    ]);
  });

  it("never mutes publication subscription alerts", () => {
    expect(
      mutedNotificationTypes({ inapp_publications: false })
    ).toEqual([]);
  });

  it("ignores unrelated preference keys", () => {
    expect(
      mutedNotificationTypes({ email_likes: false, push_likes: false })
    ).toEqual([]);
  });

  it("survives a malformed preferences blob", () => {
    expect(mutedNotificationTypes("not an object")).toEqual([]);
    expect(mutedNotificationTypes(42)).toEqual([]);
  });
});
