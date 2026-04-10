import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "./ProfileForm";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, full_name, bio, university, field_of_study, avatar_url, interests")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Profile settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Update your profile information and preferences.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <ProfileForm
          profile={{
            id: profile.id,
            username: profile.username,
            full_name: profile.full_name ?? null,
            bio: profile.bio ?? null,
            university: profile.university ?? null,
            field_of_study: profile.field_of_study ?? null,
            avatar_url: profile.avatar_url ?? null,
            interests: (profile.interests as string[] | null) ?? null,
          }}
        />
      </div>
    </div>
  );
}
