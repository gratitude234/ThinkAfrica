"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import CreateTrigger from "./CreateTrigger";
import {
  ExploreIcon,
  HomeIcon,
  NAV_MATCH_PREFIXES,
  NotificationsIcon,
  ProfileIcon,
  WriteIcon,
  getProfileNavHref,
  guestAwareHref,
  isAccountNavActive,
  isNavItemActive,
  type NavIconProps,
} from "./navItems";

interface SideRailProps {
  userId: string | null;
  username: string | null;
}

// Deliberately reuses NavClient's existing active/idle tokens rather than
// inventing a rail-specific treatment -- this rail is a structural change, not
// a visual one.
function railLinkClass(isCurrent: boolean) {
  return `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
    isCurrent
      ? "font-semibold text-emerald-brand rail-link-current"
      : "font-medium text-ink-muted hover:bg-[#073929]/[0.04] hover:text-ink"
  }`;
}

const ICON_CLASS = "h-5 w-5 shrink-0";

function RailLink({
  href,
  label,
  icon: Icon,
  isCurrent,
  fillWhenActive = false,
}: {
  href: string;
  label: string;
  icon: ComponentType<NavIconProps>;
  isCurrent: boolean;
  fillWhenActive?: boolean;
}) {
  return (
    <Link
      href={href}
      className={railLinkClass(isCurrent)}
      aria-label={label}
      title={label}
      aria-current={isCurrent ? "page" : undefined}
    >
      <Icon className={ICON_CLASS} filled={fillWhenActive && isCurrent} />
      <span className="app-rail-label truncate">{label}</span>
    </Link>
  );
}

export default function SideRail({
  userId,
  username,
}: SideRailProps) {
  const pathname = usePathname();

  return (
    <aside
      // Shared fixed rail: 56px icons on tablet, 176px labelled on desktop.
      className="app-side-rail"
    >
      <nav aria-label="Sections" className="flex flex-col gap-[3px]">
        <RailLink
          href={userId ? "/" : "/?guest=1"}
          label="Home"
          icon={HomeIcon}
          fillWhenActive
          isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.home)}
        />
        <RailLink
          href="/explore"
          label="Explore"
          icon={ExploreIcon}
          isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.explore)}
        />
        {/* Write sits in its place in the order but carries the primary
            treatment: it is the one action, not another place to browse. */}
        <CreateTrigger
          aria-label="Write"
          title="Write"
          userId={userId}
          className="my-1 flex min-h-11 w-full items-center gap-3 rounded-[10px] bg-emerald-brand px-3 py-2.5 text-[14.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          <WriteIcon className={ICON_CLASS} />
          <span className="app-rail-label truncate">Write</span>
        </CreateTrigger>
        <RailLink
          href={guestAwareHref(userId, "/notifications")}
          label="Notifications"
          icon={NotificationsIcon}
          fillWhenActive
          isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.notifications)}
        />
        <RailLink
          href={getProfileNavHref({ userId, username })}
          label={userId ? "Profile" : "Join"}
          icon={ProfileIcon}
          fillWhenActive
          isCurrent={isAccountNavActive(pathname, { userId, username })}
        />
      </nav>
    </aside>
  );
}
