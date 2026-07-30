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

export type NotificationCategory =
  | "responses"
  | "review"
  | "opportunities"
  | "activity";

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
   * Placeholder glyph shown when the actor has no avatar. Still ASCII; replacing
   * these with real icons is a separate change, but there is now one table to swap.
   */
  icon: string;
  /** Fallback copy, used only when the stored `message` is null. */
  describe: (context: NotificationContext) => string;
  /** Fallback destination, used only when the stored `link` is null. */
  hrefFor?: (context: NotificationContext) => string | null;
}

const toPost = (context: NotificationContext) =>
  context.postSlug ? `/post/${context.postSlug}` : null;
const toProfile = (context: NotificationContext) =>
  context.actorUsername ? `/${context.actorUsername}` : null;
const toDebates = () => "/debates";
const toGuidelines = () => "/editorial-standards";

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
    icon: "!!",
    describe: () =>
      "Your account has been suspended. Open the editorial standards for details.",
    hrefFor: toGuidelines,
  },
  moderation_post_removed: {
    label: "Post removed",
    category: "review",
    priority: 2,
    cta: "Read the guidelines",
    actionKey: "moderation_post_removed",
    actionable: true,
    icon: "!!",
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
    icon: "!!",
    describe: () =>
      "One of your comments was hidden for breaking the community guidelines.",
    hrefFor: toGuidelines,
  },

  // --- Editorial workflow ---------------------------------------------------
  revision_requested: {
    label: "Revision requested",
    category: "review",
    priority: 10,
    cta: "Revise submission",
    actionKey: "revision_requested",
    actionable: true,
    icon: "RV",
    describe: (context) => `Reviewer feedback is ready for ${context.postTitle}.`,
    hrefFor: toPost,
  },
  review_reminder: {
    label: "Review overdue",
    category: "review",
    priority: 15,
    cta: "Finish review",
    actionKey: "review_reminder",
    actionable: true,
    icon: "R!",
    describe: (context) =>
      `Your review of ${context.postTitle} is still outstanding.`,
    hrefFor: toPost,
  },
  review_assigned: {
    label: "Review assigned",
    category: "review",
    priority: 40,
    cta: "Open review",
    actionKey: "review_assigned",
    actionable: true,
    icon: "R",
    describe: (context) =>
      `You have been assigned to review ${context.postTitle}.`,
    hrefFor: toPost,
  },
  review_started: {
    label: "Submission under review",
    category: "review",
    priority: 52,
    cta: "Open submission",
    actionKey: "review_started",
    actionable: false,
    icon: "R",
    describe: (context) => `${context.postTitle} is now under review.`,
    hrefFor: toPost,
  },
  post_published: {
    label: "Published",
    category: "review",
    priority: 50,
    cta: "View publication",
    // Kept from the previous shared branch so existing analytics keep resolving.
    actionKey: "status_update",
    actionable: true,
    icon: "P",
    describe: (context) => `${context.postTitle} has been published.`,
    hrefFor: toPost,
  },
  post_approved: {
    label: "Approved",
    category: "review",
    priority: 50,
    cta: "Open post",
    actionKey: "status_update",
    actionable: true,
    icon: "OK",
    describe: (context) => `${context.postTitle} was approved.`,
    hrefFor: toPost,
  },
  post_rejected: {
    label: "Not accepted",
    category: "review",
    priority: 50,
    cta: "Open dashboard",
    actionKey: "status_update",
    actionable: true,
    icon: "X",
    describe: (context) =>
      `${context.postTitle} was not accepted for publication.`,
    hrefFor: () => "/dashboard",
  },
  fellowship: {
    label: "Fellowship update",
    category: "review",
    priority: 50,
    cta: "Open update",
    actionKey: "status_update",
    actionable: true,
    icon: "$",
    describe: () => "You have a fellowship update.",
  },

  // --- Conversation ---------------------------------------------------------
  response_post: {
    label: "Response to your work",
    category: "responses",
    priority: 20,
    cta: "Read response",
    actionKey: "response_received",
    actionable: true,
    icon: "RE",
    describe: (context) =>
      `${context.actorName} wrote a response to ${context.postTitle}.`,
    hrefFor: toPost,
  },
  comment: {
    label: "New comment",
    category: "activity",
    priority: 70,
    cta: "Open comment",
    actionKey: "comment",
    actionable: false,
    icon: "...",
    describe: (context) =>
      `${context.actorName} commented on ${context.postTitle}.`,
    hrefFor: toPost,
  },

  // --- Opportunities --------------------------------------------------------
  opportunity_inquiry: {
    label: "Opportunity inquiry",
    category: "opportunities",
    priority: 30,
    cta: "Review inquiry",
    actionKey: "opportunity_inquiry",
    actionable: true,
    icon: "OP",
    describe: () =>
      "A partner sent structured opportunity interest for your profile.",
    hrefFor: () => "/dashboard#opportunity-interest",
  },

  // --- Collaboration --------------------------------------------------------
  co_author_invite: {
    label: "Co-author invite",
    category: "activity",
    priority: 35,
    cta: "Review invite",
    actionKey: "co_author_invite",
    actionable: true,
    icon: "CO",
    describe: (context) =>
      `${context.actorName} invited you to co-author ${context.postTitle}.`,
    hrefFor: toPost,
  },
  co_author_accepted: {
    label: "Co-author invite accepted",
    category: "activity",
    priority: 60,
    cta: "Open post",
    actionKey: "co_author_accepted",
    actionable: false,
    icon: "CO",
    describe: (context) =>
      `${context.actorName} accepted your co-author invitation on ${context.postTitle}.`,
    hrefFor: toPost,
  },
  co_author_declined: {
    label: "Co-author invite declined",
    category: "activity",
    priority: 60,
    cta: "Open post",
    actionKey: "co_author_declined",
    actionable: false,
    icon: "CO",
    describe: (context) =>
      `${context.actorName} declined your co-author invitation on ${context.postTitle}.`,
    hrefFor: toPost,
  },

  // --- Debates --------------------------------------------------------------
  debate_invitation: {
    label: "Debate invitation",
    category: "activity",
    priority: 45,
    cta: "Review invitation",
    actionKey: "debate_invitation",
    actionable: true,
    icon: "D",
    describe: (context) => `${context.actorName} invited you to a debate.`,
    hrefFor: toDebates,
  },
  debate_phase_advanced: {
    label: "Debate stage opened",
    category: "activity",
    priority: 55,
    cta: "Open debate",
    actionKey: "debate_phase_advanced",
    actionable: true,
    icon: ">",
    describe: () => "A debate has moved to its next stage.",
    hrefFor: toDebates,
  },
  debate_v2_round_change: {
    label: "New debate round",
    category: "activity",
    priority: 56,
    cta: "Open debate",
    actionKey: "debate_v2_round_change",
    actionable: true,
    icon: ">",
    describe: () => "A new debate round is open.",
    hrefFor: toDebates,
  },
  debate_v2_direct_response: {
    label: "Direct response",
    category: "activity",
    priority: 57,
    cta: "Open debate",
    actionKey: "debate_v2_direct_response",
    actionable: true,
    icon: "?",
    describe: () => "You received a direct response in a debate.",
    hrefFor: toDebates,
  },
  debate_v2_evidence_requested: {
    label: "Evidence requested",
    category: "activity",
    priority: 58,
    cta: "Open debate",
    actionKey: "debate_v2_evidence_requested",
    actionable: true,
    icon: "E",
    describe: () => "Evidence was requested for one of your debate claims.",
    hrefFor: toDebates,
  },
  debate_v2_final_vote: {
    label: "Final vote open",
    category: "activity",
    priority: 59,
    cta: "Open debate",
    actionKey: "debate_v2_final_vote",
    actionable: true,
    icon: "V",
    describe: () => "Final voting is open in a debate.",
    hrefFor: toDebates,
  },
  debate_invitation_response: {
    label: "Debate invitation update",
    category: "activity",
    priority: 60,
    cta: "Open debate",
    actionKey: "debate_invitation_response",
    actionable: false,
    icon: "D",
    describe: () => "A debater responded to your invitation.",
    hrefFor: toDebates,
  },
  debate_cancelled: {
    label: "Debate cancelled",
    category: "activity",
    priority: 62,
    cta: "View record",
    actionKey: "debate_cancelled",
    actionable: false,
    icon: "X",
    describe: () => "A debate you joined was cancelled.",
    hrefFor: toDebates,
  },
  debate_reply: {
    label: "New debate argument",
    category: "activity",
    priority: 72,
    cta: "Open debate",
    actionKey: "debate_reply",
    actionable: false,
    icon: "D",
    describe: (context) => `${context.actorName} added a debate argument.`,
    hrefFor: toDebates,
  },
  debate_argument: {
    label: "New debate argument",
    category: "activity",
    priority: 72,
    cta: "Open debate",
    actionKey: "debate_argument",
    actionable: false,
    icon: "D",
    describe: (context) => `${context.actorName} added a debate argument.`,
    hrefFor: toDebates,
  },

  // --- Publication delivery -------------------------------------------------
  author_published: {
    label: "New from an author you follow",
    category: "activity",
    priority: 78,
    cta: "Read now",
    actionKey: "author_published",
    actionable: false,
    icon: "NEW",
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
    icon: "#",
    describe: (context) =>
      `New work was published in a topic you subscribe to: ${context.postTitle}.`,
    hrefFor: toPost,
  },

  // --- Audience -------------------------------------------------------------
  // Subscribing outranks a follow: it is the strongest signal a reader can give,
  // and it opts them into every future publication.
  author_subscribed: {
    label: "New subscriber",
    category: "activity",
    priority: 75,
    cta: "View profile",
    actionKey: "author_subscribed",
    actionable: false,
    icon: "SUB",
    describe: (context) => `${context.actorName} subscribed to your work.`,
    hrefFor: toProfile,
  },
  follow: {
    label: "New follower",
    category: "activity",
    priority: 80,
    cta: "View profile",
    actionKey: "follow",
    actionable: false,
    icon: "+",
    describe: (context) => `${context.actorName} started following your work.`,
    hrefFor: toProfile,
  },
  badge: {
    label: "New badge",
    category: "activity",
    priority: 85,
    cta: "View profile",
    actionKey: "badge",
    actionable: false,
    icon: "*",
    describe: () => "You earned a new badge.",
    hrefFor: toProfile,
  },
  like: {
    label: "New like",
    category: "activity",
    priority: 90,
    cta: "View post",
    actionKey: "like",
    actionable: false,
    icon: "<3",
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
  icon: "N",
  describe: () => "You have a new update.",
};

export function describeNotificationType(type: string): NotificationDescriptor {
  return NOTIFICATION_DESCRIPTORS[type] ?? FALLBACK_DESCRIPTOR;
}

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

/** The stored message always wins; descriptors only supply the fallback. */
export function notificationMessage(subject: NotificationSubject): string {
  const stored = subject.message?.trim();
  if (stored) return stored;
  return describeNotificationType(subject.type).describe(
    notificationContext(subject)
  );
}

/**
 * Resolves where a notification points. Returns null when nothing sensible can be
 * built, so a surface can render the row as plain text rather than a dead link.
 */
export function notificationHref(subject: NotificationSubject): string | null {
  if (subject.link) return subject.link;
  const descriptor = describeNotificationType(subject.type);
  return descriptor.hrefFor?.(notificationContext(subject)) ?? null;
}

export function notificationIcon(type: string): string {
  return describeNotificationType(type).icon;
}

export function isActionableType(type: string): boolean {
  return describeNotificationType(type).actionable;
}
