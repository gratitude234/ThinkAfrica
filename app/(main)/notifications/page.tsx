import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsPageClient from "./NotificationsPageClient";
import { fetchNotificationRows } from "./notificationData";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/notifications");

  // The client owns read/dismiss state, so it takes the flat row list and derives
  // date sections, the unread count and the action summary from that single source.
  const { rows: notifications } = await fetchNotificationRows(supabase, user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <NotificationsPageClient userId={user.id} notifications={notifications} />
    </div>
  );
}
