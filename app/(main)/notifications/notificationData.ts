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

const NOTIFICATIONS_SELECT = `
  id, type, read, created_at, actor_id, post_id, message, link,
  actor:profiles!notifications_actor_id_fkey(full_name, username, avatar_url),
  post:posts!notifications_post_id_fkey(title, slug)
`;

type NotificationsQueryClient = {
  from: (table: string) => any;
};

export interface NotificationRowsResult {
  rows: NotificationData[];
  error: string | null;
}

export async function fetchNotificationRows(
  supabase: NotificationsQueryClient,
  userId: string
): Promise<NotificationRowsResult> {
  const { data: raw, error } = await supabase
    .from("notifications")
    .select(NOTIFICATIONS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = ((raw ?? []) as Array<Record<string, unknown>>).map((notification) => {
    const rawActor = notification.actor as
      | NotificationData["actor"]
      | NotificationData["actor"][]
      | null;
    const rawPost = notification.post as
      | { title: string; slug: string }
      | { title: string; slug: string }[]
      | null;
    const actor = Array.isArray(rawActor) ? rawActor[0] ?? null : rawActor;
    const post = Array.isArray(rawPost) ? rawPost[0] ?? null : rawPost;

    return {
      id: notification.id as string,
      type: notification.type as string,
      read: notification.read as boolean,
      created_at: notification.created_at as string,
      message: (notification.message as string | null) ?? null,
      link: (notification.link as string | null) ?? null,
      post_id: (notification.post_id as string | null) ?? null,
      actor,
      actor_username: actor?.username ?? null,
      post_title: post?.title ?? null,
      post_slug: post?.slug ?? null,
    };
  });

  return { rows, error: error?.message ?? null };
}
