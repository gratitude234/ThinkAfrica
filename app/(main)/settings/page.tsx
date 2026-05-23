import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfileCredibilitySummary } from "@/lib/profileCredibility";
import ProfileForm from "./ProfileForm";
import AccountForm from "./AccountForm";
import NotificationsForm, { type NotificationPrefs } from "./NotificationsForm";
import PrivacyForm, { type PrivacySettings } from "./PrivacyForm";

const VALID_TABS = ["profile", "account", "notifications", "privacy"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "account", label: "Account & Security" },
  { value: "notifications", label: "Notifications" },
  { value: "privacy", label: "Privacy" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const { tab: rawTab } = await searchParams;
  const tab: SettingsTab = VALID_TABS.includes(rawTab as SettingsTab)
    ? (rawTab as SettingsTab)
    : "profile";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, bio, country, university, field_of_study, graduation_year, is_alumni, open_to_mentoring, verified, verified_type, signup_email, avatar_url, interests, cover_image_url, profile_type, secondary_profile_types, organization_name, professional_title, organization_website, notification_prefs, privacy_settings"
    )
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const credibilitySummary = getProfileCredibilitySummary({
    profile: {
      full_name: profile.full_name,
      username: profile.username,
      bio: profile.bio,
      country: profile.country,
      university: profile.university,
      field_of_study: profile.field_of_study,
      avatar_url: profile.avatar_url,
      verified: profile.verified,
      verified_type: profile.verified_type,
      interests: (profile.interests as string[] | null) ?? [],
    },
    stats: {
      featuredWorkCount: 1,
      opportunityReadinessScore: 100,
      isOpenToOpportunities: true,
    },
  });

  const notifPrefs: NotificationPrefs = {
    email_comments: true,
    email_follows: true,
    email_likes: true,
    email_published: true,
    email_digest: true,
    email_account_security: true,
    email_profile_reminders: true,
    ...((profile.notification_prefs as Partial<NotificationPrefs>) ?? {}),
  };

  const privacySettings: PrivacySettings = {
    profile_visibility: "public",
    allow_messages: "everyone",
    show_in_directory: true,
    ...((profile.privacy_settings as Partial<PrivacySettings>) ?? {}),
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Tab navigation */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg bg-gray-100 p-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/settings?tab=${t.value}`}
              className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Credibility banner — profile tab only */}
      {tab === "profile" && credibilitySummary.missingProfileItems.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            Profile credibility
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">
              {credibilitySummary.profileCompletionScore}% complete
            </h2>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
              {credibilitySummary.missingProfileItems.length} left
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-800">
            Complete these public signals so readers and opportunity partners can trust your profile faster.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {credibilitySummary.missingProfileItems.slice(0, 6).map((item) => (
              <div
                key={item.key}
                className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-sm font-medium text-amber-900"
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {tab === "profile" && (
          <ProfileForm
            profile={{
              id: profile.id,
              username: profile.username,
              full_name: profile.full_name ?? null,
              bio: profile.bio ?? null,
              country: profile.country ?? null,
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
              profile_type: profile.profile_type ?? null,
              secondary_profile_types:
                (profile.secondary_profile_types as string[] | null) ?? [],
              organization_name: profile.organization_name ?? null,
              professional_title: profile.professional_title ?? null,
              organization_website: profile.organization_website ?? null,
            }}
          />
        )}
        {tab === "account" && <AccountForm email={user.email!} />}
        {tab === "notifications" && (
          <NotificationsForm profileId={profile.id} notificationPrefs={notifPrefs} />
        )}
        {tab === "privacy" && (
          <PrivacyForm profileId={profile.id} privacySettings={privacySettings} />
        )}
      </div>
    </div>
  );
}
