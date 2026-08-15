"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";
import CreateTrigger from "./CreateTrigger";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import {
  BookmarksIcon,
  DebatesIcon,
  ExploreIcon,
  HomeIcon,
  MessagesIcon,
  NAV_MATCH_PREFIXES,
  OpportunitiesIcon,
  ProfileIcon,
  isAccountNavActive,
  isNavItemActive,
  type NavIconProps,
} from "./navItems";

interface SideRailProps {
  userId: string | null;
  username: string | null;
  hasActiveDebate: boolean;
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
  badge,
  children,
}: {
  href: string;
  label: string;
  icon: ComponentType<NavIconProps>;
  isCurrent: boolean;
  fillWhenActive?: boolean;
  badge?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={railLinkClass(isCurrent)}
      aria-current={isCurrent ? "page" : undefined}
    >
      <span className="relative flex shrink-0 items-center">
        <Icon className={ICON_CLASS} filled={fillWhenActive && isCurrent} />
        {badge}
      </span>
      <span className="truncate">{label}</span>
      {children}
    </Link>
  );
}

export default function SideRail({
  userId,
  username,
  hasActiveDebate,
}: SideRailProps) {
  const pathname = usePathname();

  const guestHref = (target: string) =>
    userId ? target : `/login?redirectTo=${encodeURIComponent(target)}`;

  const accountActive = isAccountNavActive(pathname, { userId, username });

  return (
    <aside
      // Sticky under the top nav and independently scrollable, so a short
      // viewport can still reach the Create button. The +1rem offset is shared
      // with every other sticky aside in the app (home sidebar, explore, admin,
      // the debate surfaces) so columns in the same viewport pin in line -- and
      // it tracks --app-nav-offset rather than the measured height so the rail
      // rises with the nav when it retreats, instead of the feed's tab strip
      // sliding up while this column stays behind. max-h stays on the measured
      // height: it is a ceiling, not a size, and animating it would resize a
      // scrolling column mid-scroll for no visible gain.
      className="hidden xl:sticky xl:top-[var(--app-sticky-offset)] xl:block xl:max-h-[calc(100dvh-var(--app-nav-height)-2rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain"
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
        {FEATURE_FLAGS.debates ? (
          <RailLink
            href="/debates"
            label="Debates"
            icon={DebatesIcon}
            isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.debates)}
            badge={
              hasActiveDebate ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-brand ring-2 ring-white"
                />
              ) : undefined
            }
          >
            {hasActiveDebate ? (
              <span className="sr-only">A debate is live now</span>
            ) : null}
          </RailLink>
        ) : null}
        <RailLink
          href="/opportunities"
          label="Opportunities"
          icon={OpportunitiesIcon}
          isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.opportunities)}
        />
        <RailLink
          href={guestHref("/bookmarks")}
          label="Bookmarks"
          icon={BookmarksIcon}
          fillWhenActive
          isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.bookmarks)}
        />
        <RailLink
          href={guestHref("/messages")}
          label="Messages"
          icon={MessagesIcon}
          fillWhenActive
          isCurrent={isNavItemActive(pathname, NAV_MATCH_PREFIXES.messages)}
          badge={
            userId ? (
              <MessagesUnreadBadge userId={userId} className="-right-1.5 -top-1.5" />
            ) : undefined
          }
        />
        <RailLink
          href={userId ? "/me" : "/signup"}
          label={userId ? "Me" : "Join"}
          icon={ProfileIcon}
          fillWhenActive
          isCurrent={accountActive}
        />
      </nav>

      <CreateTrigger
        userId={userId}
        className="mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-brand px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
        Create
      </CreateTrigger>
    </aside>
  );
}
