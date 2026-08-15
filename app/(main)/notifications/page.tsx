import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationsPageClient from "./NotificationsPageClient";
import { fetchNotificationRows } from "@/lib/notificationData";
import { mutedNotificationTypes } from "@/lib/notificationPreferences";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/notifications");

  const { data: privateProfileRaw } = await supabase.rpc(
    "get_my_profile_private"
  );
  const privateProfile = normalizeMyPrivateProfile(privateProfileRaw);

  const mutedTypes = mutedNotificationTypes(privateProfile?.notification_prefs);

  // The client owns read/dismiss state, so it takes the flat row list and derives
  // date sections, the unread count and the action summary from that single source.
  // It also takes the muted types so its own polling keeps applying them.
  const { rows: notifications } = await fetchNotificationRows(
    supabase,
    user.id,
    50,
    mutedTypes
  );

  return (
    <div className="mx-auto max-w-3xl">
      <NotificationsPageClient
        userId={user.id}
        notifications={notifications}
        mutedTypes={mutedTypes}
      />
    </div>
  );
}
