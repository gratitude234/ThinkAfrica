import { describe, expect, it } from "vitest";
import {
  FALLBACK_DESCRIPTOR,
  NOTIFICATION_DESCRIPTORS,
  describeNotificationType,
  notificationHref,
  notificationIcon,
  notificationMessage,
  type NotificationIconName,
} from "./notificationCatalog";

const ICON_NAMES: NotificationIconName[] = [
  "arrow-right", "badge-check", "ban", "bell", "briefcase", "chat",
  "check-circle", "clipboard", "clock", "document", "hashtag", "heart",
  "pencil", "question", "reply", "scale", "shield-alert", "star", "trophy",
  "user-plus", "users", "x-circle",
];

/**
 * Every notification type this codebase actually writes, traced from the
 * `.from("notifications").insert` call sites and the SQL that inserts directly:
 *
 *   likeActions, followActions and admin/moderation/actions.
 *
 * Some types below are no longer written. Response, co-author, editorial
 * review, publication delivery and author subscription notifications stopped
 * with the publishing reset, but their rows are still in inboxes and must keep
 * rendering with copy of their own, so they stay covered here.
 *
 * Anything emitted but missing from the catalog renders as "New notification"
 * with an "Open" CTA at the lowest priority, which is what this guards against.
 */
const EMITTED_TYPES = [
  // engagement
  "like",
  "follow",
  "author_subscribed",
  "response_post",
  // collaboration
  "co_author_invite",
  "co_author_accepted",
  "co_author_declined",
  "research_collaboration_request",
  "research_collaboration_accepted",
  "research_collaboration_declined",
  // editorial
  "review_assigned",
  "review_started",
  "review_reminder",
  "revision_requested",
  "post_published",
  "post_rejected",
  // retired publication delivery
  "author_published",
  "topic_published",
  // trust and safety
  "moderation_post_removed",
  "moderation_comment_hidden",
  "account_suspended",
];

describe("catalog coverage", () => {
  it.each(EMITTED_TYPES)("describes %s", (type) => {
    expect(NOTIFICATION_DESCRIPTORS[type]).toBeDefined();
  });

  it("gives every emitted type copy of its own", () => {
    const generic = EMITTED_TYPES.filter(
      (type) =>
        describeNotificationType(type).label === FALLBACK_DESCRIPTOR.label
    );
    expect(generic).toEqual([]);
  });

  it("gives every descriptor a non-empty label and CTA", () => {
    for (const [type, descriptor] of Object.entries(NOTIFICATION_DESCRIPTORS)) {
      expect(descriptor.label, type).not.toBe("");
      expect(descriptor.cta, type).not.toBe("");
    }
  });

  it("falls back gracefully for a type it has never seen", () => {
    const descriptor = describeNotificationType("something_invented_later");
    expect(descriptor).toBe(FALLBACK_DESCRIPTOR);
    expect(notificationIcon("something_invented_later")).toBe("bell");
  });
});

describe("priority ordering", () => {
  const priorityOf = (type: string) => describeNotificationType(type).priority;

  it("ranks trust-and-safety notices above everything else", () => {
    // Regression: these were unmapped, so an account suspension sorted at
    // priority 100 — below a like.
    for (const type of [
      "account_suspended",
      "moderation_post_removed",
      "moderation_comment_hidden",
    ]) {
      expect(priorityOf(type)).toBeLessThan(priorityOf("revision_requested"));
      expect(priorityOf(type)).toBeLessThan(priorityOf("like"));
      expect(describeNotificationType(type).actionable).toBe(true);
    }
  });

  it("files retired workflow and collaboration rows as ordinary history", () => {
    for (const type of [
      "revision_requested",
      "review_reminder",
      "review_assigned",
      "review_started",
      "post_approved",
      "post_rejected",
      "co_author_invite",
      "co_author_accepted",
      "co_author_declined",
      "research_collaboration_request",
      "research_collaboration_accepted",
      "research_collaboration_declined",
    ]) {
      expect(describeNotificationType(type)).toMatchObject({
        category: "activity",
        actionable: false,
      });
    }
    expect(describeNotificationType("post_approved").label).toBe("Published");
    expect(priorityOf("follow")).toBeLessThan(priorityOf("like"));
  });
});

describe("retired subscription notifications", () => {
  it.each(["author_published", "topic_published", "author_subscribed"])(
    "files a historic %s row as ordinary activity",
    (type) => {
      expect(describeNotificationType(type)).toMatchObject({
        category: "activity",
        actionable: false,
      });
    }
  );

  it("renders a historic subscriber as the follow it also was", () => {
    expect(describeNotificationType("author_subscribed")).toMatchObject({
      label: describeNotificationType("follow").label,
      priority: describeNotificationType("follow").priority,
    });
  });

  it("describes no badge notification", () => {
    expect(NOTIFICATION_DESCRIPTORS.badge).toBeUndefined();
  });
});

describe("notificationMessage", () => {
  const subject = {
    type: "author_published",
    message: null,
    post_title: "Designing Lagos",
    post_slug: "designing-lagos",
    actor: { full_name: "Ama Mensah", username: "ama" },
    actor_username: "ama",
  };

  it("prefers the stored message over the fallback", () => {
    expect(
      notificationMessage({ ...subject, message: "Stored copy" })
    ).toBe("Stored copy");
  });

  it("treats a blank stored message as absent", () => {
    expect(notificationMessage({ ...subject, message: "   " })).toBe(
      "Ama Mensah published new work: Designing Lagos."
    );
  });

  it("names the actor rather than saying 'Someone'", () => {
    // The bell dropdown used to render the actor generically because its query
    // never joined profiles.
    expect(notificationMessage({ ...subject, type: "follow" })).toBe(
      "Ama Mensah started following your work."
    );
  });

  it("degrades to 'Someone' only when there really is no actor", () => {
    expect(
      notificationMessage({ type: "follow", message: null, actor: null })
    ).toBe("Someone started following your work.");
  });

  it("degrades to 'your work' when the post title is missing", () => {
    expect(
      notificationMessage({ type: "like", message: null, actor: null })
    ).toBe("Someone liked your work.");
  });

  it("does not surface stored review-era copy from historic rows", () => {
    expect(
      notificationMessage({
        type: "post_approved",
        message: "Your submission was approved by the editorial team.",
        post_title: null,
      })
    ).toBe("your work has been published.");
  });
});

describe("notificationHref", () => {
  it("prefers the stored link", () => {
    expect(
      notificationHref({ type: "follow", link: "/ama?from=follow", actor_username: "ama" })
    ).toBe("/ama?from=follow");
  });

  it("ignores a retired tracked-delivery link and opens the post", () => {
    expect(
      notificationHref({
        type: "author_published",
        link: "/r/p/123e4567-e89b-42d3-a456-426614174000",
        post_slug: "designing-lagos",
      })
    ).toBe("/post/designing-lagos");
  });

  it("falls back to the actor profile for audience notifications", () => {
    expect(notificationHref({ type: "follow", actor_username: "ama" })).toBe("/ama");
    expect(
      notificationHref({ type: "author_subscribed", actor_username: "ama" })
    ).toBe("/ama");
  });

  it("falls back to the post for content notifications", () => {
    expect(notificationHref({ type: "like", post_slug: "designing-lagos" })).toBe(
      "/post/designing-lagos"
    );
  });

  it("sends moderation notices to the terms of use", () => {
    for (const type of [
      "account_suspended",
      "moderation_post_removed",
      "moderation_comment_hidden",
    ]) {
      expect(notificationHref({ type })).toBe("/terms");
    }
  });


  it("returns null when nothing sensible can be built", () => {
    // The surface renders these as plain text rather than a dead link.
    expect(notificationHref({ type: "like" })).toBeNull();
    expect(notificationHref({ type: "follow" })).toBeNull();
    expect(notificationHref({ type: "something_invented_later" })).toBeNull();
  });
});

describe("icons and tones", () => {
  it("assigns every descriptor an icon the artwork table can render", () => {
    // The union is the contract between this module and NotificationAvatar; a name
    // with no path would render an empty circle.
    for (const [type, descriptor] of Object.entries(NOTIFICATION_DESCRIPTORS)) {
      expect(ICON_NAMES, type).toContain(descriptor.icon);
    }
  });

  it("reserves the critical tone for trust and safety", () => {
    // Rejections and declined co-author invitations used to be critical too.
    // Both are retired workflows whose historic rows now render as neutral
    // activity.
    const critical = Object.entries(NOTIFICATION_DESCRIPTORS)
      .filter(([, descriptor]) => descriptor.tone === "critical")
      .map(([type]) => type)
      .sort();

    expect(critical).toEqual([
      "account_suspended",
      "moderation_comment_hidden",
      "moderation_post_removed",
    ]);
    for (const retired of ["post_rejected", "co_author_declined"]) {
      expect(describeNotificationType(retired).tone, retired).toBe("neutral");
    }
  });

  it("does not tint routine activity", () => {
    // A like and a suspension cannot both be coloured or neither reads as urgent.
    for (const type of ["like", "follow", "comment", "author_published"]) {
      expect(describeNotificationType(type).tone, type).toBe("neutral");
    }
  });

  it("no longer uses ASCII placeholder glyphs", () => {
    // "<3", "NEW", "+", "OK" -- rendered as unstyled-looking text in a grey circle
    // and announced literally by screen readers.
    for (const [type, descriptor] of Object.entries(NOTIFICATION_DESCRIPTORS)) {
      expect(descriptor.icon, type).toMatch(/^[a-z][a-z-]*$/);
    }
  });
});
