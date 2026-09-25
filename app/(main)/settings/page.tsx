import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserForProtectedPage } from "@/lib/serverAuth";
import { IN_APP_PREF_DEFAULTS } from "@/lib/notificationPreferences";
import AccountForm from "./AccountForm";
import NotificationsForm, { type NotificationPrefs } from "./NotificationsForm";
import PrivacyForm, { type PrivacySettings } from "./PrivacyForm";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";

const VALID_TABS = ["account", "notifications", "privacy"] as const;
type SettingsTab = (typeof VALID_TABS)[number];

const TABS: { value: SettingsTab; label: string }[] = [
  { value: "account", label: "Account & Security" },
  { value: "notifications", label: "Notifications" },
  { value: "privacy", label: "Privacy" },
];

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const { tab: rawTab } = await searchParams;
  // Profile editing has its own canonical route. The old tab value is still a
  // live link everywhere it was bookmarked, in old notification emails, and in
  // admin verification messages, so it redirects rather than 404s.
  // Bare /settings stays on this page and opens Account, so Edit profile can
  // link back here without bouncing straight out again.
  if (rawTab === "profile") {
    redirect("/settings/profile");
  }
  const tab: SettingsTab = VALID_TABS.includes(rawTab as SettingsTab)
    ? (rawTab as SettingsTab)
    : "account";

  const supabase = await createClient();
  const user = await getUserForProtectedPage(supabase);

  if (!user) redirect("/login?redirectTo=/settings");

  // The profile row is no longer read here. Nothing on these three tabs shows
  // a profile field, and the persona, school and onboarding path this page
  // used to load were only ever handed to the retired profile form.
  const { data: privateProfileRaw } = await supabase.rpc("get_my_profile_private");
  const privateProfile = normalizeMyPrivateProfile(privateProfileRaw);

  // A stored email_author_publications or push_author_publications key is left
  // in the blob untouched. Author subscriptions were removed in the publishing
  // reset, Phase 2H, and nothing reads either key any more.
  const notifPrefs: NotificationPrefs = {
    email_comments: true,
    email_follows: true,
    email_likes: true,
    email_account_security: true,
    email_announcements: true,

    push_comments: true,
    push_likes: true,
    push_follows: true,

    ...IN_APP_PREF_DEFAULTS,
    ...((privateProfile?.notification_prefs as Partial<NotificationPrefs>) ?? {}),
  };

  const privacySettings: PrivacySettings = {
    profile_visibility: "public",
    show_in_directory: true,
    ...((privateProfile?.privacy_settings as Partial<PrivacySettings>) ?? {}),
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

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {tab === "account" && <AccountForm email={user.email!} />}
        {tab === "notifications" && (
          <NotificationsForm
            profileId={user.id}
            notificationPrefs={notifPrefs}
          />
        )}
        {tab === "privacy" && (
          <PrivacyForm privacySettings={privacySettings} />
        )}
      </div>
    </div>
  );
}
