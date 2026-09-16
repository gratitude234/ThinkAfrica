/**
 * Single source of truth for how every notification type is presented.
 *
 * This used to be five overlapping tables that disagreed with each other:
 * `lib/actionInbox.ts` knew labels/categories/priorities for 17 types,
 * `NotificationItem` had its own fallback-copy switch plus an icon map,
 * `NotificationBell` had a third, smaller copy switch and a second icon map, and
 * only `NotificationItem` knew how to build a fallback link. Roughly eighteen
 * types the codebase actually emits were in none of them, so they rendered as
 * "New notification" with an "Open" CTA -- including `moderation_post_removed`,
 * `moderation_comment_hidden` and `account_suspended`, which were additionally
 * filed under "activity" at the lowest priority, below likes.
 *
 * Everything a surface needs to render a notification is now described once, here.
 */

export type NotificationCategory = "review" | "activity";

/**
 * Semantic icon names. These replaced ASCII placeholder glyphs ("<3", "NEW", "+",
 * "OK") that rendered as a grey circle with letters in it -- read as broken or
 * unstyled UI, collided across types (three different types shared "OK", two
 * shared "RE"), and were announced literally by screen readers, so a like was
 * "less than three".
 *
 * The name is deliberately abstract: this module stays React-free, and
 * components/notifications/NotificationAvatar.tsx owns the actual artwork.
 */
export type NotificationIconName =
  | "arrow-right"
  | "badge-check"
  | "ban"
  | "bell"
  | "briefcase"
  | "chat"
  | "check-circle"
  | "clipboard"
  | "clock"
  | "document"
  | "hashtag"
  | "heart"
  | "pencil"
  | "question"
  | "reply"
  | "scale"
  | "shield-alert"
  | "star"
  | "trophy"
  | "user-plus"
  | "users"
  | "x-circle";

/**
 * Colour intent for the icon. Kept scarce on purpose: if a like and a suspension
 * are both tinted, neither tint means anything. Only trust-and-safety and
 * rejections are `critical`; only work that is overdue or blocked is `attention`.
 */
export type NotificationTone = "critical" | "attention" | "positive" | "neutral";

export interface NotificationSubject {
  type: string;
  message?: string | null;
  link?: string | null;
  post_title?: string | null;
  post_slug?: string | null;
  actor_username?: string | null;
  actor?: {
    full_name?: string | null;
    username?: string | null;
  } | null;
}

export interface NotificationContext {
  actorName: string;
  postTitle: string;
  postSlug: string | null;
  actorUsername: string | null;
}

export interface NotificationDescriptor {
  label: string;
  category: NotificationCategory;
  /** Lower sorts first. Trust-and-safety notices lead; passive activity trails. */
  priority: number;
  cta: string;
  /** Stable analytics key. Preserved across this refactor even where labels changed. */
  actionKey: string;
  /**
   * Whether the notification asks the reader to *do* something. Only actionable
   * items are eligible for a "Needs attention" hero.
   */
  actionable: boolean;
  /**
   * Type icon. Shown as a badge over the actor's avatar, or standalone when there
   * is no avatar to badge.
   */
  icon: NotificationIconName;
  tone: NotificationTone;
  /** Fallback copy, used only when the stored `message` is null. */
  describe: (context: NotificationContext) => string;
  /** Fallback destination, used only when the stored `link` is null. */
  hrefFor?: (context: NotificationContext) => string | null;
}

const toPost = (context: NotificationContext) =>
  context.postSlug ? `/post/${context.postSlug}` : null;
const toProfile = (context: NotificationContext) =>
  context.actorUsername ? `/${context.actorUsername}` : null;
const toGuidelines = () => "/terms";

export const NOTIFICATION_DESCRIPTORS: Record<string, NotificationDescriptor> = {
  // --- Trust and safety -----------------------------------------------------
  // These outrank everything else. They were previously unmapped entirely, which
  // rendered an account suspension as "New notification" beneath a like.
  account_suspended: {
    label: "Account suspended",
    category: "review",
    priority: 1,
    cta: "Read the guidelines",
    actionKey: "account_suspended",
    actionable: true,
    icon: "ban",
    tone: "critical",
    describe: () =>
      "Your account has been suspended. Open the terms of use for details.",
    hrefFor: toGuidelines,
  },
  moderation_post_removed: {
    label: "Post removed",
    category: "review",
    priority: 2,
    cta: "Read the guidelines",
    actionKey: "moderation_post_removed",
    actionable: true,
    icon: "shield-alert",
    tone: "critical",
    describe: (context) =>
      `${context.postTitle} was removed for breaking the community guidelines.`,
    hrefFor: toGuidelines,
  },
  moderation_comment_hidden: {
    label: "Comment hidden",
    category: "review",
    priority: 3,
    cta: "Read the guidelines",
    actionKey: "moderation_comment_hidden",
    actionable: true,
    icon: "shield-alert",
    tone: "critical",
    describe: () =>
      "One of your comments was hidden for breaking the community guidelines.",
    hrefFor: toGuidelines,
  },

  // --- Editorial workflow ---------------------------------------------------
  revision_requested: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "status_update",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  review_reminder: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "status_update",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  review_assigned: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "status_update",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  review_started: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "status_update",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  post_published: {
    label: "Published",
    category: "activity",
    priority: 50,
    cta: "View publication",
    // Kept from the previous shared branch so existing analytics keep resolving.
    actionKey: "status_update",
    actionable: true,
    icon: "badge-check",
    tone: "positive",
    describe: (context) => `${context.postTitle} has been published.`,
    hrefFor: toPost,
  },
  post_approved: {
    label: "Published",
    category: "activity",
    priority: 50,
    cta: "View publication",
    actionKey: "status_update",
    actionable: false,
    icon: "badge-check",
    tone: "positive",
    describe: (context) => `${context.postTitle} has been published.`,
    hrefFor: toPost,
  },
  post_rejected: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open notifications",
    actionKey: "status_update",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: () => "/notifications",
  },

  // --- Conversation ---------------------------------------------------------
  // LEGACY COMPATIBILITY — historic response_post notification. Responses are
  // retired and none is written any more. Old rows still render and open the
  // piece they announced, filed under activity and asking nothing of the reader.
  response_post: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an older activity update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  comment: {
    label: "New comment",
    category: "activity",
    priority: 70,
    cta: "Open comment",
    actionKey: "comment",
    actionable: false,
    icon: "chat",
    tone: "neutral",
    describe: (context) =>
      `${context.actorName} commented on ${context.postTitle}.`,
    hrefFor: toPost,
  },

  // --- Collaboration --------------------------------------------------------
  co_author_invite: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  co_author_accepted: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  co_author_declined: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open publication",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) => `There is an update related to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  research_collaboration_request: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open notifications",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: () => "There is an older account activity update.",
    hrefFor: () => "/notifications",
  },
  research_collaboration_accepted: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open notifications",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: () => "There is an older account activity update.",
    hrefFor: () => "/notifications",
  },
  research_collaboration_declined: {
    label: "Activity",
    category: "activity",
    priority: 70,
    cta: "Open notifications",
    actionKey: "activity",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: () => "There is an older account activity update.",
    hrefFor: () => "/notifications",
  },

  // --- Retired publication delivery ----------------------------------------
  // Author subscriptions and their delivery were removed in the publishing
  // reset, Phase 2H, and nothing sends these any more. Existing rows still
  // render, as ordinary activity.
  author_published: {
    label: "New from an author you follow",
    category: "activity",
    priority: 78,
    cta: "Read now",
    actionKey: "author_published",
    actionable: false,
    icon: "document",
    tone: "neutral",
    describe: (context) =>
      `${context.actorName} published new work: ${context.postTitle}.`,
    hrefFor: toPost,
  },
  topic_published: {
    label: "New in a topic you follow",
    category: "activity",
    priority: 79,
    cta: "Read now",
    actionKey: "topic_published",
    actionable: false,
    icon: "hashtag",
    tone: "neutral",
    describe: (context) =>
      `New work was published in a topic you follow: ${context.postTitle}.`,
    hrefFor: toPost,
  },

  // --- Audience -------------------------------------------------------------
  // Retired with author subscriptions in Phase 2H. A subscriber always
  // followed too, so an existing row reads as the follow it also was.
  author_subscribed: {
    label: "New follower",
    category: "activity",
    priority: 80,
    cta: "View profile",
    actionKey: "author_subscribed",
    actionable: false,
    icon: "user-plus",
    tone: "neutral",
    describe: (context) => `${context.actorName} started following your work.`,
    hrefFor: toProfile,
  },
  follow: {
    label: "New follower",
    category: "activity",
    priority: 80,
    cta: "View profile",
    actionKey: "follow",
    actionable: false,
    icon: "user-plus",
    tone: "neutral",
    describe: (context) => `${context.actorName} started following your work.`,
    hrefFor: toProfile,
  },
  like: {
    label: "New like",
    category: "activity",
    priority: 90,
    cta: "View post",
    actionKey: "like",
    actionable: false,
    icon: "heart",
    tone: "neutral",
    describe: (context) => `${context.actorName} liked ${context.postTitle}.`,
    hrefFor: toPost,
  },
};

export const FALLBACK_DESCRIPTOR: NotificationDescriptor = {
  label: "New notification",
  category: "activity",
  priority: 100,
  cta: "Open",
  actionKey: "notification",
  actionable: false,
  icon: "bell",
  tone: "neutral",
  describe: () => "You have a new update.",
};

export function describeNotificationType(type: string): NotificationDescriptor {
  return NOTIFICATION_DESCRIPTORS[type] ?? FALLBACK_DESCRIPTOR;
}


const RETIRED_PRODUCT_NOTIFICATION_TYPES = new Set([
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
  "response_post",
]);

export function notificationContext(
  subject: NotificationSubject
): NotificationContext {
  return {
    actorName:
      subject.actor?.full_name?.trim() ||
      subject.actor?.username?.trim() ||
      "Someone",
    postTitle: subject.post_title?.trim() || "your work",
    postSlug: subject.post_slug ?? null,
    actorUsername: subject.actor_username ?? subject.actor?.username ?? null,
  };
}

/** Current-product stored copy wins. Retired product rows deliberately render
 * through the neutral compatibility descriptor so old review/collaboration
 * wording cannot leak back into the simplified UI. */
export function notificationMessage(subject: NotificationSubject): string {
  if (!RETIRED_PRODUCT_NOTIFICATION_TYPES.has(subject.type)) {
    const stored = subject.message?.trim();
    if (stored) return stored;
  }
  return describeNotificationType(subject.type).describe(
    notificationContext(subject)
  );
}

/**
 * Resolves where a notification points. Returns null when nothing sensible can be
 * built, so a surface can render the row as plain text rather than a dead link.
 */
/**
 * The tracked-delivery links publication alerts used to carry. The route that
 * resolved them was removed with publication delivery in Phase 2H, so a
 * stored one is ignored and the notification links to its post instead.
 */
const RETIRED_DELIVERY_LINK = /^\/r\/p\//;

export function notificationHref(subject: NotificationSubject): string | null {
  if (
    !RETIRED_PRODUCT_NOTIFICATION_TYPES.has(subject.type) &&
    subject.link &&
    !RETIRED_DELIVERY_LINK.test(subject.link)
  ) {
    return subject.link;
  }
  const descriptor = describeNotificationType(subject.type);
  return descriptor.hrefFor?.(notificationContext(subject)) ?? null;
}

export function notificationIcon(type: string): string {
  return describeNotificationType(type).icon;
}

export function isActionableType(type: string): boolean {
  return describeNotificationType(type).actionable;
}
