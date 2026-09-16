import { getUsableProfileUsername } from "@/lib/profileUsername";
import { matchesRoute } from "./navRoutes";

/**
 * Single source of truth for primary-navigation destinations and their
 * active-state rules.
 *
 * The product has exactly five destinations: Home, Explore, Write,
 * Notifications and Profile. Three shells render them -- the mobile bottom bar,
 * the top bar, and the desktop side rail -- and each has legitimately different
 * markup. What they must not have is different opinions about which
 * destinations exist or which one is currently active. The shells own their own
 * layout and classes; they share the data and the predicates below.
 */

export interface NavIconProps {
  className?: string;
  /**
   * Solid-fill the glyph when the destination is active. Only the closed
   * shapes (home, bell, person) read well filled -- the magnifier and the pen
   * are open paths and stay stroked either way.
   */
  filled?: boolean;
}

export function HomeIcon({ className, filled }: NavIconProps) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10.75L12 3l9 7.75V21H14.75v-5.5h-5.5V21H3V10.75z"
      />
    </svg>
  );
}

export function ExploreIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
      />
    </svg>
  );
}

export function WriteIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.75 14.25.45-2.35 5.55-5.55a1.6 1.6 0 0 1 2.25 0l.15.15a1.6 1.6 0 0 1 0 2.25l-5.55 5.55-2.35.45.5-2.35"
      />
    </svg>
  );
}

export function NotificationsIcon({ className, filled }: NavIconProps) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}

export function ProfileIcon({ className, filled }: NavIconProps) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 21a8 8 0 10-16 0m12-11a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

/**
 * Pathname prefixes that mark each destination active. Search and topic pages
 * are discovery surfaces, so they light Explore; `/discover` is the same
 * surface under an older URL.
 */
export const NAV_MATCH_PREFIXES = {
  home: ["/"],
  explore: ["/explore", "/discover", "/search", "/topics"],
  write: ["/write"],
  notifications: ["/notifications"],
} as const;

export function isNavItemActive(
  pathname: string,
  prefixes: readonly string[]
) {
  return prefixes.some((prefix) =>
    // "/" would match everything under a boundary test, so it is exact-only.
    prefix === "/" ? pathname === "/" : matchesRoute(pathname, prefix)
  );
}

/** Guests are sent through sign-in and land where they were heading. */
export function guestAwareHref(userId: string | null, target: string) {
  return userId ? target : `/login?redirectTo=${encodeURIComponent(target)}`;
}

/**
 * The Profile destination is the signed-in writer's public profile. A username
 * that cannot be used as a route falls back to profile settings, where it can
 * be fixed; a guest is offered sign-up instead.
 */
export function getProfileNavHref({
  userId,
  username,
}: {
  userId: string | null;
  username: string | null;
}) {
  if (!userId) return "/signup";
  const usable = getUsableProfileUsername(username);
  return usable ? `/${usable}` : "/settings/profile";
}

/**
 * The Profile destination stands for a cluster of personal surfaces, so it
 * stays lit across all of them rather than only on the profile itself.
 */
export function isAccountNavActive(
  pathname: string,
  { userId, username }: { userId: string | null; username: string | null }
) {
  if (!userId) return pathname === "/signup";

  const ownProfile = username ? `/${username}` : null;

  return (
    matchesRoute(pathname, "/me") ||
    matchesRoute(pathname, "/dashboard") ||
    matchesRoute(pathname, "/bookmarks") ||
    matchesRoute(pathname, "/settings") ||
    (ownProfile ? matchesRoute(pathname, ownProfile) : false)
  );
}
