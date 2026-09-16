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
  return `group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-[14.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
    isCurrent
      ? "border-emerald-100 bg-emerald-50 font-semibold text-emerald-950"
      : "border-transparent font-medium text-ink-muted hover:border-gray-200 hover:bg-white hover:text-ink"
  }`;
}

const ICON_CLASS = "h-[21px] w-[21px] shrink-0";

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
      aria-current={isCurrent ? "page" : undefined}
    >
      <Icon className={ICON_CLASS} filled={fillWhenActive && isCurrent} />
      <span className="truncate">{label}</span>
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
      // Sticky under the top nav and independently scrollable, so a short
      // viewport can still reach every destination. The +1rem offset is shared
      // with every other sticky aside in the app (home sidebar, explore, admin)
      // so columns in the same viewport pin in line -- and it tracks
      // --app-nav-offset rather than the measured height so the rail rises with
      // the nav when it retreats. max-h stays on the measured height: it is a
      // ceiling, not a size.
      //
      // Deliberately not overscroll-contain. A nav rail beside a feed is not a
      // surface you would lose your place behind, and containment made the page
      // stop dead under the pointer on short windows. Chaining keeps one gesture
      // meaning one thing wherever it lands.
      className="hidden md:sticky md:top-[var(--app-sticky-offset)] md:block md:max-h-[calc(100dvh-var(--app-nav-height)-2rem)] md:self-start md:overflow-y-auto"
    >
      <nav aria-label="Sections" className="flex flex-col gap-0.5">
        <RailLink
          href="/"
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
          userId={userId}
          className="my-1 flex min-h-11 w-full items-center gap-3 rounded-xl bg-emerald-brand px-3 py-2.5 text-[14.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          <WriteIcon className={ICON_CLASS} />
          <span className="truncate">Write</span>
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
