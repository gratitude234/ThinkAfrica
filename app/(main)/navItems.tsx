import { matchesRoute } from "./navRoutes";

/**
 * Single source of truth for primary-navigation destinations and their
 * active-state rules.
 *
 * Three shells render this nav -- the mobile bottom bar, the top bar, and the
 * desktop side rail -- and each has legitimately different markup. What they
 * must not have is three different opinions about which destination is
 * currently active, which is what happened before this module existed.
 * The shells own their own layout and classes; they share the data and the
 * predicates below.
 */

export interface NavIconProps {
  className?: string;
  /**
   * Solid-fill the glyph when the destination is active. Only the closed
   * shapes (home, message bubble, person) read well filled -- the magnifier
   * and the balance scale are open paths and stay stroked either way.
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
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
      />
    </svg>
  );
}

export function DebatesIcon({ className }: NavIconProps) {
  return (
    // Balance scale rather than a speech bubble: Messages sits next to this
    // and already owns the bubble.
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 4v16m-7-3h14M5 7l-2 6h4L5 7zm14 0l-2 6h4l-2-6zM7 5h10"
      />
    </svg>
  );
}

export function MessagesIcon({ className, filled }: NavIconProps) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z"
      />
    </svg>
  );
}

export function ResponsesIcon({ className }: NavIconProps) {
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
        d="M7 7h10a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-4l-4 3v-3H7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3Z"
      />
      <path strokeLinecap="round" d="M8 11h8" />
    </svg>
  );
}

export function CampusIcon({ className }: NavIconProps) {
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
        d="m3 9 9-5 9 5-9 5-9-5Zm3 2.5V17c2.8 2.1 9.2 2.1 12 0v-5.5M21 9v7"
      />
    </svg>
  );
}

export function ResearchIcon({ className }: NavIconProps) {
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
        d="M9 3h6m-5 0v5l-5.5 9.25A2.5 2.5 0 0 0 6.65 21h10.7a2.5 2.5 0 0 0 2.15-3.75L14 8V3M7.5 15h9"
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
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 21a8 8 0 10-16 0m12-11a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

export function OpportunitiesIcon({ className }: NavIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8.5h16v10a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-10zm5-.5V6a2 2 0 012-2h2a2 2 0 012 2v2M4 12.5h16"
      />
    </svg>
  );
}

export function BookmarksIcon({ className, filled }: NavIconProps) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4.75A1.75 1.75 0 017.75 3h8.5A1.75 1.75 0 0118 4.75V21l-6-4.25L6 21V4.75z"
      />
    </svg>
  );
}

/**
 * Pathname prefixes that mark each destination active. `/discover` is folded
 * into Explore because it is the same surface under an older URL.
 */
export const NAV_MATCH_PREFIXES = {
  home: ["/"],
  explore: ["/explore", "/discover"],
  debates: ["/debates"],
  opportunities: ["/opportunities"],
  messages: ["/messages"],
  responses: ["/responses"],
  campus: ["/campus"],
  research: ["/research"],
  bookmarks: ["/bookmarks"],
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

/**
 * The account destination stands for a cluster of personal surfaces, so it
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
