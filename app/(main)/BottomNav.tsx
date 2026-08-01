"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CreateLauncher from "./CreateLauncher";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";
import { shouldShowMobilePrimaryNav } from "./navRoutes";
import {
  DebatesIcon,
  ExploreIcon,
  HomeIcon,
  MessagesIcon,
  NAV_MATCH_PREFIXES,
  ProfileIcon,
  isAccountNavActive,
  isNavItemActive,
} from "./navItems";

interface BottomNavProps {
  username: string | null;
  userId: string | null;
  hasActiveDebate: boolean;
}

function navLinkClass(isCurrent: boolean) {
  return `flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
    isCurrent ? "text-emerald-brand" : "text-gray-500 hover:text-gray-700"
  }`;
}

// px-2 rather than px-3: five destinations have to share a 320px-wide bar,
// and the wider pill pushed "Messages" into wrapping on the narrowest phones.
function navPillClass(isCurrent: boolean) {
  return `flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 transition-colors duration-150 ${
    isCurrent ? "bg-emerald-50" : ""
  }`;
}

export default function BottomNav({
  username,
  userId,
  hasActiveDebate,
}: BottomNavProps) {
  const pathname = usePathname();
  const isPostPage = pathname.startsWith("/post/");
  const showPrimaryNav = shouldShowMobilePrimaryNav(pathname);
  if (!showPrimaryNav && !isPostPage) {
    return null;
  }

  const isHomeActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.home);
  const isExploreActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.explore);
  const isDebatesActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.debates);
  const isMessagesActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.messages);
  const profileHref = userId ? "/me" : "/signup";
  const profileActive = isAccountNavActive(pathname, { userId, username });
  const profileLabel = userId ? "Me" : "Join";

  return (
    <>
      <CreateLauncher userId={userId} variant="mobileFab" isPostPage={isPostPage} />

      {showPrimaryNav ? (
        <nav
          className="fixed left-0 right-0 z-50 border-t border-gray-100 bg-white shadow-[0_-2px_12px_-2px_rgb(0_0_0/0.06)] md:hidden"
          style={{
            bottom: "var(--mobile-visual-viewport-bottom, 0px)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          aria-label="Primary navigation"
        >
        <div className="flex h-[60px] items-center justify-around px-2">
          <Link
            href="/"
            className={navLinkClass(isHomeActive)}
            aria-current={isHomeActive ? "page" : undefined}
          >
            <span className={navPillClass(isHomeActive)}>
              <HomeIcon className="h-[22px] w-[22px]" filled={isHomeActive} />
              <span className="whitespace-nowrap text-[11px] font-medium">Home</span>
            </span>
          </Link>

          <Link
            href="/explore"
            className={navLinkClass(isExploreActive)}
            aria-current={isExploreActive ? "page" : undefined}
          >
            <span className={navPillClass(isExploreActive)}>
              <ExploreIcon className="h-[22px] w-[22px]" />
              <span className="whitespace-nowrap text-[11px] font-medium">Explore</span>
            </span>
          </Link>

          <Link
            href="/debates"
            className={navLinkClass(isDebatesActive)}
            aria-current={isDebatesActive ? "page" : undefined}
          >
            <span className={navPillClass(isDebatesActive)}>
              <div className="relative">
                <DebatesIcon className="h-[22px] w-[22px]" />
                {hasActiveDebate ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-brand ring-2 ring-white"
                  />
                ) : null}
              </div>
              <span className="whitespace-nowrap text-[11px] font-medium">
                Debates
              </span>
              {hasActiveDebate ? (
                <span className="sr-only">A debate is live now</span>
              ) : null}
            </span>
          </Link>

          <Link
            href="/messages"
            className={navLinkClass(isMessagesActive)}
            aria-current={isMessagesActive ? "page" : undefined}
          >
            <span className={navPillClass(isMessagesActive)}>
              <div className="relative">
                <MessagesIcon
                  className="h-[22px] w-[22px]"
                  filled={isMessagesActive}
                />
                {userId ? (
                  <MessagesUnreadBadge userId={userId} className="-right-1.5 -top-1.5" />
                ) : null}
              </div>
              <span className="whitespace-nowrap text-[11px] font-medium">Messages</span>
            </span>
          </Link>

          <Link
            href={profileHref}
            className={navLinkClass(profileActive)}
            aria-current={profileActive ? "page" : undefined}
          >
            <span className={navPillClass(profileActive)}>
              <ProfileIcon className="h-[22px] w-[22px]" filled={profileActive} />
              <span className="whitespace-nowrap text-[11px] font-medium">{profileLabel}</span>
            </span>
          </Link>
        </div>
        </nav>
      ) : null}
    </>
  );
}
