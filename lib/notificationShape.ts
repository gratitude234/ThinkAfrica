/**
 * The notification shapes and the date grouping the UI renders with.
 *
 * Split out of `lib/notificationData.ts` because that module is now
 * `server-only`: it reaches the database through the adapter, and a client
 * component importing it would pull the whole server repository graph into the
 * browser bundle. The build says so rather than letting it through, which is
 * how this was found.
 *
 * Nothing here touches the database. `lib/notificationData.ts` re-exports all
 * of it, so server code can keep importing from one place.
 */

export interface NotificationData {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  message?: string | null;
  link?: string | null;
  post_id?: string | null;
  actor: {
    full_name: string | null;
    username: string;
    avatar_url: string | null;
  } | null;
  actor_username: string | null;
  post_title: string | null;
  post_slug: string | null;
  post_content_kind: string | null;
}

export interface NotificationSection {
  label: string;
  items: NotificationData[];
}

export function groupByDate(notifications: NotificationData[]): {
  today: NotificationData[];
  thisWeek: NotificationData[];
  earlier: NotificationData[];
} {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const weekAgoStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  const today: NotificationData[] = [];
  const thisWeek: NotificationData[] = [];
  const earlier: NotificationData[] = [];

  for (const notification of notifications) {
    const timestamp = new Date(notification.created_at).getTime();
    if (timestamp >= todayStart) today.push(notification);
    else if (timestamp >= weekAgoStart) thisWeek.push(notification);
    else earlier.push(notification);
  }

  return { today, thisWeek, earlier };
}

export function sectionsFromNotifications(
  notifications: NotificationData[]
): NotificationSection[] {
  const { today, thisWeek, earlier } = groupByDate(notifications);
  return [
    { label: "Today", items: today },
    { label: "This week", items: thisWeek },
    { label: "Earlier", items: earlier },
  ].filter((section) => section.items.length > 0);
}

// The projection and the mute filter moved into lib/db/notifications.ts,
// where both transports share one definition of them. Keeping a copy here
// would let the inbox and the badge drift apart again.
type NotificationsQueryClient = {
  from: (table: string) => any;
};
