import Link from "next/link";
import {
  PROFILE_TABS,
  PROFILE_TAB_LABELS,
  profileTabHref,
  type ProfileTab,
} from "@/lib/profileTabs";

/**
 * Posts, Articles and About. Plain links, so every tab is an address a reader
 * can share, and `scroll={false}` so switching tabs does not jump the page
 * back above the header.
 */
export default function ProfileTabs({
  username,
  active,
}: {
  username: string;
  active: ProfileTab;
}) {
  return (
    <nav aria-label="Profile" className="border-b border-card-border">
      <ul className="-mb-px flex gap-6">
        {PROFILE_TABS.map((tab) => {
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
