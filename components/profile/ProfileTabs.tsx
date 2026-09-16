import Link from "next/link";
import {
  OWNER_PROFILE_TABS,
  PROFILE_TAB_LABELS,
  PUBLIC_PROFILE_TABS,
  profileTabHref,
  type ProfileTab,
} from "@/lib/profileTabs";

export default function ProfileTabs({
  username,
  active,
  isOwnProfile,
}: {
  username: string;
  active: ProfileTab;
  isOwnProfile: boolean;
}) {
  const tabs = isOwnProfile ? OWNER_PROFILE_TABS : PUBLIC_PROFILE_TABS;

  return (
    <nav aria-label="Profile" className="overflow-x-auto border-b border-card-border">
      <ul className="-mb-px flex min-w-max gap-6">
        {tabs.map((tab) => {
          const current = tab === active;
          return (
            <li key={tab}>
              <Link
                href={profileTabHref(username, tab)}
                scroll={false}
                aria-current={current ? "page" : undefined}
                className={`focus-ring inline-flex min-h-11 items-center border-b-2 text-sm font-semibold transition-colors ${
                  current
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {PROFILE_TAB_LABELS[tab]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}