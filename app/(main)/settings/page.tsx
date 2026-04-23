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
    .select("id, username, full_name, bio, university, field_of_study, graduation_year, is_alumni, open_to_mentoring, verified, verified_type, signup_email, avatar_url, interests, cover_image_url")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const missingFields: string[] = [];
  if (!profile.bio) missingFields.push("bio");
  if (!profile.field_of_study) missingFields.push("field of study");
  if (!profile.avatar_url) missingFields.push("profile photo");
  if (!((profile.interests as string[] | null)?.length ?? 0)) {
    missingFields.push("interests");
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Profile settings</h1>
        <p className="text-gray-500 text-sm mt-1">
          Update your profile information and preferences.
        </p>
      </div>

      {missingFields.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="flex-shrink-0 text-lg text-amber-500">💡</span>
          <p className="text-sm text-amber-800">
            Complete your profile to rank higher and attract fellowship opportunities.{" "}
            <span className="font-medium">Missing: {missingFields.join(", ")}.</span>
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <ProfileForm
          profile={{
            id: profile.id,
            username: profile.username,
            full_name: profile.full_name ?? null,
            bio: profile.bio ?? null,
            university: profile.university ?? null,
            field_of_study: profile.field_of_study ?? null,
            graduation_year: profile.graduation_year ?? null,
            is_alumni: profile.is_alumni ?? false,
            open_to_mentoring: profile.open_to_mentoring ?? false,
            verified: profile.verified ?? false,
            verified_type: profile.verified_type ?? null,
            signup_email: profile.signup_email ?? null,
            avatar_url: profile.avatar_url ?? null,
            interests: (profile.interests as string[] | null) ?? null,
            cover_image_url: (profile.cover_image_url as string | null) ?? null,
          }}
        />
      </div>
    </div>
  );
}
