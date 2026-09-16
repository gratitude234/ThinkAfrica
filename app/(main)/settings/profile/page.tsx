import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadProfileSettings } from "@/lib/profileSettingsData";
import { createClient } from "@/lib/supabase/server";
import ProfileSettings from "./ProfileSettings";

export const metadata: Metadata = {
  title: "Edit profile",
  description: "Edit your public profile, topics and visibility.",
};

/**
 * The one place a member edits their public profile.
 *
 * `/settings?tab=profile` redirects here and keeps working for bookmarks and
 * old emails. Account security, passwords and notification preferences stay on
 * `/settings`.
 */
export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=%2Fsettings%2Fprofile");

  const model = await loadProfileSettings(supabase, user.id);
  if (!model) redirect("/login");

  return <ProfileSettings model={model} />;
}
