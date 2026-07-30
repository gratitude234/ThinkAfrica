import {
  describeNotificationType,
  isActionableType,
  notificationHref,
  notificationMessage,
  type NotificationCategory,
} from "./notificationCatalog";

/**
 * Categories are exactly the descriptor categories -- nothing more.
 *
 * This used to carry an extra "needs_attention" member that no notification type
 * was ever assigned, because the inbox needed a key for its unread filter. A
 * category that cannot match anything is a trap: every consumer had to remember to
 * special-case it, and the inbox's chip row silently mixed one state filter in with
 * four real categories while presenting them identically. Read/unread is a state,
 * so the inbox now models it as one.
 */
export type ActionInboxCategory = NotificationCategory;

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

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export { isActionableType };

/**
 * Labels, categories, priorities, CTAs and fallback copy all come from
 * lib/notificationCatalog.ts, which is the one place any notification type is
 * described. This function only adapts a stored row to the inbox's shape.
 */
function notificationToAction(
  notification: ActionInboxNotificationInput
): ActionInboxItem {
  const descriptor = describeNotificationType(notification.type);

  return {
    notificationId: notification.id,
    type: notification.type,
    read: notification.read,
    createdAt: notification.created_at,
    postId: notification.post_id ?? null,
    category: descriptor.category,
    priority: descriptor.priority,
    label: descriptor.label,
    cta: descriptor.cta,
    actionKey: descriptor.actionKey,
    actionable: descriptor.actionable,
    description: notificationMessage(notification),
    // Every inbox item needs somewhere to go, so an unlinkable notification falls
    // back to the inbox itself rather than rendering a broken CTA.
    href: notificationHref(notification) ?? "/notifications",
  };
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
