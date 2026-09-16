import { redirect } from "next/navigation";
import NotificationsPageClient from "./NotificationsPageClient";
import { fetchNotificationRows } from "@/lib/notificationData";
import { mutedNotificationTypes } from "@/lib/notificationPreferences";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/notifications");

  const { data: privateProfileRaw } = await supabase.rpc("get_my_profile_private");
  const privateProfile = normalizeMyPrivateProfile(privateProfileRaw);
  const mutedTypes = mutedNotificationTypes(privateProfile?.notification_prefs);
  const { rows: notifications } = await fetchNotificationRows(
    supabase,
    user.id,
    50,
    mutedTypes
  );

  return (
    <div className="mx-auto max-w-3xl">
      <NotificationsPageClient notifications={notifications} />
    </div>
  );
}