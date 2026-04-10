import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationItem from "./NotificationItem";

interface NotificationData {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  actor: { full_name: string | null; username: string } | null;
  actor_username: string | null;
  post_title: string | null;
  post_slug: string | null;
}

function groupByDate(notifications: NotificationData[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekAgoStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  const today: NotificationData[] = [];
  const thisWeek: NotificationData[] = [];
  const earlier: NotificationData[] = [];

  for (const n of notifications) {
    const t = new Date(n.created_at).getTime();
    if (t >= todayStart) today.push(n);
    else if (t >= weekAgoStart) thisWeek.push(n);
    else earlier.push(n);
  }

  return { today, thisWeek, earlier };
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/notifications");

  // Fetch notifications with actor profiles and post titles
  const { data: raw } = await supabase
    .from("notifications")
    .select(
      `
      id, type, read, created_at, actor_id, post_id,
      actor:profiles!notifications_actor_id_fkey(full_name, username),
      post:posts!notifications_post_id_fkey(title, slug)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  // Mark all as read
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  const notifications = (raw ?? []).map((n) => {
    const actor = Array.isArray(n.actor) ? n.actor[0] : n.actor;
    const post = Array.isArray(n.post) ? n.post[0] : n.post;
    return {
      id: n.id,
      type: n.type,
      read: n.read,
      created_at: n.created_at,
      actor: actor as { full_name: string | null; username: string } | null,
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
  ].filter((s) => s.items.length > 0);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <span className="text-4xl block mb-4">🔔</span>
          <p className="text-gray-500 font-medium">No notifications yet</p>
          <p className="text-gray-400 text-sm mt-1">
            You&apos;ll be notified when someone likes or comments on your posts.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {section.label}
                </p>
              </div>
              {section.items.map((n) => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
