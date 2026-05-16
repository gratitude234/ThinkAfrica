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
}

export interface ActionInboxGroup {
  key: ActionInboxCategory;
  label: string;
  items: ActionInboxItem[];
}

export interface ActionInboxSummary {
  primaryAction: ActionInboxItem | null;
  items: ActionInboxItem[];
  groups: ActionInboxGroup[];
  unreadActionCount: number;
  staleUnreadCount: number;
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
