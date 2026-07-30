export type ActionInboxCategory =
  | "needs_attention"
  | "responses"
  | "review"
  | "opportunities"
  | "activity";

export interface ActionInboxNotificationInput {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  message?: string | null;
  link?: string | null;
  post_id?: string | null;
  post_title?: string | null;
  post_slug?: string | null;
  actor_username?: string | null;
  actor?: {
    full_name?: string | null;
    username?: string | null;
  } | null;
}

export interface ActionInboxItem {
  notificationId: string;
  type: string;
  category: ActionInboxCategory;
  priority: number;
  read: boolean;
  createdAt: string;
  label: string;
  description: string;
  href: string;
  cta: string;
  actionKey: string;
  postId: string | null;
  /**
   * Whether this notification asks the reader to *do* something (revise a draft,
   * answer an invitation, respond to an inquiry) as opposed to merely telling them
   * something happened (a like, a follow, a new publication).
   *
   * Only actionable items are eligible to be promoted into a "Needs attention"
   * hero. Without this distinction the hero was simply the newest unread row, so a
   * single new follower rendered as a full-width NEEDS ATTENTION banner with a
   * primary CTA -- over-claiming urgency and training people to ignore the banner.
   */
  actionable: boolean;
}

export interface ActionInboxGroup {
  key: ActionInboxCategory;
  label: string;
  items: ActionInboxItem[];
}

export interface ActionInboxSummary {
  primaryAction: ActionInboxItem | null;
  /**
   * The highest-priority unread item that actually asks for a response. This is
   * what a "Needs attention" hero should render; `primaryAction` is just the top
   * unread row of any kind and stays available for callers that want that.
   */
  primaryActionable: ActionInboxItem | null;
  items: ActionInboxItem[];
  groups: ActionInboxGroup[];
  unreadActionCount: number;
  staleUnreadCount: number;
}

/**
 * Types that require something of the reader. Deliberately type-based rather than
 * category-based: `co_author_invite` and `debate_invitation` are filed under
 * "activity" but are among the most actionable things in the inbox.
 */
const ACTIONABLE_TYPES = new Set([
  "revision_requested",
  "response_post",
  "opportunity_inquiry",
  "review_assigned",
  "post_published",
  "post_approved",
  "post_rejected",
  "fellowship",
  "co_author_invite",
  "debate_invitation",
  "debate_phase_advanced",
]);

export function isActionableType(type: string): boolean {
  return ACTIONABLE_TYPES.has(type);
}

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function actorName(notification: ActionInboxNotificationInput) {
  return (
    notification.actor?.full_name?.trim() ||
    notification.actor?.username?.trim() ||
    "Someone"
  );
}

function postTitle(notification: ActionInboxNotificationInput) {
  return notification.post_title?.trim() || "your work";
}

function defaultHref(notification: ActionInboxNotificationInput) {
  if (notification.link) return notification.link;
  if (notification.post_slug) return `/post/${notification.post_slug}`;
  if (notification.actor_username) return `/${notification.actor_username}`;
  return "/notifications";
}

function notificationToAction(
  notification: ActionInboxNotificationInput
): ActionInboxItem {
  const described = describeNotification(notification);
  return { ...described, actionable: isActionableType(described.type) };
}

function describeNotification(
  notification: ActionInboxNotificationInput
): Omit<ActionInboxItem, "actionable"> {
  const base = {
    notificationId: notification.id,
    type: notification.type,
    read: notification.read,
    createdAt: notification.created_at,
    href: defaultHref(notification),
    postId: notification.post_id ?? null,
  };

  switch (notification.type) {
    case "revision_requested":
      return {
        ...base,
        category: "review",
        priority: 10,
        label: "Revision requested",
        description:
          notification.message ??
          `Reviewer feedback is ready for ${postTitle(notification)}.`,
        cta: "Revise submission",
        actionKey: "revision_requested",
      };
    case "response_post":
      return {
        ...base,
        category: "responses",
        priority: 20,
        label: "Response to your work",
        description:
          notification.message ??
          `${actorName(notification)} wrote a response to ${postTitle(notification)}.`,
        cta: "Read response",
        actionKey: "response_received",
      };
    case "opportunity_inquiry":
      return {
        ...base,
        category: "opportunities",
        priority: 30,
        label: "Opportunity inquiry",
        description:
          notification.message ??
          "A partner sent structured opportunity interest for your profile.",
        href: notification.link ?? "/dashboard#opportunity-interest",
        cta: "Review inquiry",
        actionKey: "opportunity_inquiry",
      };
    case "review_assigned":
      return {
        ...base,
        category: "review",
        priority: 40,
        label: "Review assigned",
        description:
          notification.message ??
          `You have been assigned to review ${postTitle(notification)}.`,
        cta: "Open review",
        actionKey: "review_assigned",
      };
    case "post_published":
    case "post_approved":
    case "post_rejected":
    case "fellowship":
      return {
        ...base,
        category: "review",
        priority: 50,
        label: "Application or review update",
        description: notification.message ?? "You have a status update to review.",
        cta: "Open update",
        actionKey: "status_update",
      };
    case "co_author_invite":
      return {
        ...base,
        category: "activity",
        priority: 60,
        label: "Co-author invite",
        description:
          notification.message ??
          `${actorName(notification)} invited you to co-author ${postTitle(notification)}.`,
        cta: "Review invite",
        actionKey: "co_author_invite",
      };
    case "debate_invitation":
      return {
        ...base,
        category: "activity",
        priority: 55,
        label: "Debate invitation",
        description:
          notification.message ??
          `${actorName(notification)} invited you to a debate.`,
        cta: "Review invitation",
        actionKey: "debate_invitation",
      };
    case "debate_invitation_response":
      return {
        ...base,
        category: "activity",
        priority: 60,
        label: "Debate invitation update",
        description:
          notification.message ?? "A debater responded to your invitation.",
        cta: "Open debate",
        actionKey: "debate_invitation_response",
      };
    case "debate_phase_advanced":
      return {
        ...base,
        category: "activity",
        priority: 60,
        label: "Debate stage opened",
        description:
          notification.message ?? "A debate has moved to its next stage.",
        cta: "Open debate",
        actionKey: "debate_phase_advanced",
      };
    case "debate_cancelled":
      return {
        ...base,
        category: "activity",
        priority: 60,
        label: "Debate cancelled",
        description:
          notification.message ?? "A debate you joined was cancelled.",
        cta: "View record",
        actionKey: "debate_cancelled",
      };
    case "comment":
      return {
        ...base,
        category: "activity",
        priority: 70,
        label: "New comment",
        description:
          notification.message ??
          `${actorName(notification)} commented on ${postTitle(notification)}.`,
        cta: "Open comment",
        actionKey: "comment",
      };
    case "follow":
      return {
        ...base,
        category: "activity",
        priority: 80,
        label: "New follower",
        description:
          notification.message ??
          `${actorName(notification)} started following your work.`,
        cta: "View profile",
        actionKey: "follow",
      };
    // Ranked ahead of a follow: subscribing is the strongest signal a reader
    // can give, and it opts them into every future publication.
    case "author_subscribed":
      return {
        ...base,
        category: "activity",
        priority: 75,
        label: "New subscriber",
        description:
          notification.message ??
          `${actorName(notification)} subscribed to your work.`,
        cta: "View profile",
        actionKey: "author_subscribed",
      };
    case "like":
      return {
        ...base,
        category: "activity",
        priority: 90,
        label: "New like",
        description:
          notification.message ??
          `${actorName(notification)} liked ${postTitle(notification)}.`,
        cta: "View post",
        actionKey: "like",
      };
    default:
      return {
        ...base,
        category: "activity",
        priority: 100,
        label: "New notification",
        description: notification.message ?? "You have a new update.",
        cta: "Open",
        actionKey: "notification",
      };
  }
}

export function getActionInboxSummary(
  notifications: ActionInboxNotificationInput[]
): ActionInboxSummary {
  const now = Date.now();
  const items = notifications
    .map(notificationToAction)
    .sort((left, right) => {
      if (left.read !== right.read) return left.read ? 1 : -1;
      if (left.priority !== right.priority) return left.priority - right.priority;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  const unreadItems = items.filter((item) => !item.read);
  const groupOrder: Array<{ key: ActionInboxCategory; label: string }> = [
    { key: "responses", label: "Responses" },
    { key: "review", label: "Review and status" },
    { key: "opportunities", label: "Opportunities" },
    { key: "activity", label: "Activity" },
  ];

  return {
    primaryAction: unreadItems[0] ?? null,
    primaryActionable: unreadItems.find((item) => item.actionable) ?? null,
    items,
    groups: groupOrder
      .map((group) => ({
        ...group,
        items: items.filter((item) => item.category === group.key),
      }))
      .filter((group) => group.items.length > 0),
    unreadActionCount: unreadItems.length,
    staleUnreadCount: unreadItems.filter((item) => {
      const created = new Date(item.createdAt).getTime();
      return !Number.isNaN(created) && now - created > STALE_MS;
    }).length,
  };
}
