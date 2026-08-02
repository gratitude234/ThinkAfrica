"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import CreateLauncher from "./CreateLauncher";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";
import { shouldShowMobilePrimaryNav } from "./navRoutes";
import { useNavAutoHide } from "@/lib/useNavAutoHide";
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

  // Focus inside the bar pins it open -- a destination that slides away from
  // the finger or the focus ring reaching for it is a trap, not an affordance.
  const [isNavFocused, setIsNavFocused] = useState(false);
  // Hooks run before the early return below so the count stays constant across
  // a route change that flips the bar off.
  //
  // Only below md, where this bar renders at all. Restricting it here keeps the
  // scroll listener off desktop entirely rather than having it compute a state
  // nothing reads.
  const isNavHidden = useNavAutoHide({
    mediaQuery: "(max-width: 767px)",
    disabled: isNavFocused,
    revealKey: pathname,
  });

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

      {/* The bar drops away on a downward scroll and returns on an upward one,
          in step with the top nav: reading a feed on a phone should get the
          whole screen, and the destinations are one flick away rather than a
          page scroll away. transform rather than bottom so the slide is
          composited and the safe-area padding travels with the bar -- and the
          bar holds no fixed descendants, so making it a containing block costs
          nothing. translate-y-full clears that padding too, which a fixed pixel
          offset would leave stranded on notched devices. */}
      {showPrimaryNav ? (
        <nav
          onFocus={() => setIsNavFocused(true)}
          onBlur={() => setIsNavFocused(false)}
          className={`fixed left-0 right-0 z-50 border-t border-gray-100 bg-white shadow-[0_-2px_12px_-2px_rgb(0_0_0/0.06)] transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden ${
            isNavHidden ? "translate-y-full" : "translate-y-0"
          }`}
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
