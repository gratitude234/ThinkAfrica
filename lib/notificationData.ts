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
  id, type, read, created_at, actor_id, post_id, message, link, dismissed_at,
  actor:profiles!notifications_actor_id_fkey(full_name, username, avatar_url),
  post:posts!notifications_post_id_fkey(title, slug)
`;

type NotificationsQueryClient = {
  from: (table: string) => any;
};

/**
 * PostgREST renders this as `type=not.in.(like,follow)`. Notification types are
 * `[a-z0-9_]+` throughout the catalog, so no value here needs quoting or escaping.
 */
function applyMutedTypes(query: any, mutedTypes: string[]) {
  if (mutedTypes.length === 0) return query;
  return query.not("type", "in", `(${mutedTypes.join(",")})`);
}

export interface NotificationRowsResult {
  rows: NotificationData[];
  error: string | null;
}

/**
 * The one notification read query. The bell dropdown previously ran its own
 * `select("*")` without the actor/post joins, which is why its fallback copy could
 * only say "Someone started following you" while the page said who.
 */
export async function fetchNotificationRows(
  supabase: NotificationsQueryClient,
  userId: string,
  limit = 50,
  mutedTypes: string[] = []
): Promise<NotificationRowsResult> {
  // Dismissed notifications are soft-deleted, not removed, so they have to be
  // filtered out here rather than relying on the row being gone.
  let query = supabase
    .from("notifications")
    .select(NOTIFICATIONS_SELECT)
    .eq("user_id", userId)
    .is("dismissed_at", null);

  // Muting filters here rather than at insert time so one rule covers both
  // surfaces, and so turning a group back on restores its history.
  query = applyMutedTypes(query, mutedTypes);

  const { data: raw, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

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

export interface UnreadCountResult {
  count: number | null;
  error: string | null;
}

/**
 * The true number of unread notifications.
 *
 * The bell used to derive its badge from the ten rows it had fetched, so the count
 * was capped at ten and — worse — simply wrong: someone with forty unread items
 * saw "3" whenever only three of the newest ten happened to be unread. This is a
 * `head` count, so it costs a round trip but transfers no rows.
 *
 * `count` is null when the query fails, so a caller can tell "no unread" apart from
 * "we do not know" and leave the previous badge alone rather than clearing it.
 */
export async function fetchUnreadCount(
  supabase: NotificationsQueryClient,
  userId: string,
  mutedTypes: string[] = []
): Promise<UnreadCountResult> {
  let query = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false)
    .is("dismissed_at", null);

  // Must match fetchNotificationRows exactly, or the badge counts notifications
  // the inbox will not show.
  query = applyMutedTypes(query, mutedTypes);

  const { count, error } = await query;

  return {
    count: typeof count === "number" ? count : null,
    error: error?.message ?? null,
  };
}
