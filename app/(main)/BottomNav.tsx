"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import { shouldShowMobilePrimaryNav } from "./navRoutes";
import { useAppChrome } from "./AppChromeProvider";

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
} from "./navItems";

interface BottomNavProps {
  username: string | null;
  userId: string | null;
}

function navLinkClass(isCurrent: boolean) {
  return `flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
    isCurrent ? "text-emerald-brand" : "text-gray-500 hover:text-gray-700"
  }`;
}

// px-2 rather than px-3: five destinations have to share a 320px-wide bar.
const NAV_MARK_CLASS = "flex flex-col items-center justify-center gap-0.5 px-2 py-1";

const WRITE_CLASS =
  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold";

function WriteMark() {
  return (
    <span className="flex flex-col items-center justify-center gap-0.5 text-emerald-brand">
      <WriteIcon className="h-[22px] w-[22px]" />
      <span className="whitespace-nowrap text-[10.5px] font-semibold">Write</span>
    </span>
  );
}

export default function BottomNav({
  username,
  userId,
}: BottomNavProps) {
  const pathname = usePathname();
  const { setInteractionLocked } = useAppChrome();
  const { requestAuth } = useGuestAuthGate();

  useEffect(() => {
    return () => setInteractionLocked(false);
  }, [setInteractionLocked]);

  const showPrimaryNav = shouldShowMobilePrimaryNav(pathname);
  // Focused writing surfaces own their navigation. Reading pages keep
  // destinations available, with scroll behavior managed by AppChromeProvider.
  if (!showPrimaryNav) {
    return null;
  }

  const isHomeActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.home);
  const isExploreActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.explore);
  const isNotificationsActive = isNavItemActive(
    pathname,
    NAV_MATCH_PREFIXES.notifications
  );
  const profileActive = isAccountNavActive(pathname, { userId, username });

  return (
    // The bar drops away on a downward scroll and returns on an upward one, in
    // step with the top nav on publication detail pages, giving readers the whole
    // screen, and the destinations are one flick away rather than a page scroll
    // away. transform rather than bottom so the slide is composited and the
    // safe-area padding travels with the bar.
    <nav
      data-app-bottom-nav=""
      data-app-chrome-motion=""
      onFocus={() => setInteractionLocked(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setInteractionLocked(false);
        }
      }}
      className="fixed left-0 right-0 z-50 translate-y-0 border-t border-[#E9E5DE] bg-[#FAF8F5] shadow-[0_-2px_12px_-2px_rgb(0_0_0/0.06)] transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden"
      style={{
        bottom: "var(--mobile-visual-viewport-bottom, 0px)",
        paddingBottom: "env(safe-area-inset-bottom)",
        height: "calc(64px + env(safe-area-inset-bottom))",
      }}
      aria-label="Primary navigation"
    >
      <div className="flex h-full items-center justify-around px-2">
        <Link
          href="/"
          className={navLinkClass(isHomeActive)}
          aria-current={isHomeActive ? "page" : undefined}
        >
          <span className={NAV_MARK_CLASS}>
            <HomeIcon className="h-[22px] w-[22px]" filled={isHomeActive} />
            <span className="whitespace-nowrap text-[10.5px] font-medium">Home</span>
          </span>
        </Link>

        <Link
          href="/explore"
          className={navLinkClass(isExploreActive)}
          aria-current={isExploreActive ? "page" : undefined}
        >
          <span className={NAV_MARK_CLASS}>
            <ExploreIcon className="h-[22px] w-[22px]" />
            <span className="whitespace-nowrap text-[10.5px] font-medium">Explore</span>
          </span>
        </Link>

        {userId ? (
          <Link href="/write" className={WRITE_CLASS}>
            <WriteMark />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => requestAuth("create", { destination: "/write" })}
            className={WRITE_CLASS}
          >
            <WriteMark />
          </button>
        )}

        <Link
          href={guestAwareHref(userId, "/notifications")}
          className={navLinkClass(isNotificationsActive)}
          aria-current={isNotificationsActive ? "page" : undefined}
        >
          <span className={NAV_MARK_CLASS}>
            <NotificationsIcon
              className="h-[22px] w-[22px]"
              filled={isNotificationsActive}
            />
            <span className="whitespace-nowrap text-[10.5px] font-medium">
              Notifications
            </span>
          </span>
        </Link>

        <Link
          href={getProfileNavHref({ userId, username })}
          className={navLinkClass(profileActive)}
          aria-current={profileActive ? "page" : undefined}
        >
          <span className={NAV_MARK_CLASS}>
            <ProfileIcon className="h-[22px] w-[22px]" filled={profileActive} />
            <span className="whitespace-nowrap text-[10.5px] font-medium">
              {userId ? "Profile" : "Join"}
            </span>
          </span>
        </Link>
      </div>
    </nav>
  );
}
