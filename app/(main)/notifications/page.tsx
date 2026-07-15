import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsPageClient from "./NotificationsPageClient";
import { fetchNotificationRows, sectionsFromNotifications } from "./notificationData";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/notifications");

  const notifications = await fetchNotificationRows(supabase, user.id);
  const sections = sectionsFromNotifications(notifications);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="mx-auto max-w-3xl">
      <NotificationsPageClient
        userId={user.id}
        initialUnreadCount={unreadCount}
        sections={sections}
      />
    </div>
  );
}
