import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsPageClient from "./NotificationsPageClient";

interface NotificationData {
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

function groupByDate(notifications: NotificationData[]) {
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

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/notifications");

  const { data: raw } = await supabase
    .from("notifications")
    .select(
      `
      id, type, read, created_at, actor_id, post_id, message, link,
      actor:profiles!notifications_actor_id_fkey(full_name, username, avatar_url),
      post:posts!notifications_post_id_fkey(title, slug)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const notifications = (raw ?? []).map((notification) => {
    const actor = Array.isArray(notification.actor)
      ? notification.actor[0]
      : notification.actor;
    const post = Array.isArray(notification.post) ? notification.post[0] : notification.post;

    return {
      id: notification.id,
      type: notification.type,
      read: notification.read,
      created_at: notification.created_at,
      message: notification.message ?? null,
      link: notification.link ?? null,
      post_id: notification.post_id ?? null,
      actor: actor as NotificationData["actor"],
      actor_username: actor?.username ?? null,
      post_title: post?.title ?? null,
      post_slug: post?.slug ?? null,
    };
  });

  const { today, thisWeek, earlier } = groupByDate(notifications);
  const sections = [
    { label: "Today", items: today },
    { label: "This week", items: thisWeek },
    { label: "Earlier", items: earlier },
  ].filter((section) => section.items.length > 0);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <NotificationsPageClient
        userId={user.id}
        initialUnreadCount={unreadCount}
        sections={sections}
      />
    </div>
  );
}
