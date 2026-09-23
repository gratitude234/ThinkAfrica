const MOBILE_FOCUS_ROUTE_PREFIXES = [
  "/write",
  "/create",
  "/edit",
] as const;

// Routes whose layout already owns the full viewport width -- /about paints
// viewport-wide bands -- plus the deliberate focus modes. Everything else in
// (main) keeps the rail, so moving from the feed to a profile or to /settings
// doesn't make the rail flicker in and out.
//
// Post pages and admin keep it too. The top bar is utilities only, so hiding
// the rail there left a signed-in reader or an admin on desktop with nothing
// but the logo as a way back into the app. Both centre their own column or
// grid inside the content track, so they fit beside it.
const RAIL_SUPPRESSED_PREFIXES = [
  "/about",
  "/write",
  "/create",
  "/edit",
] as const;

/**
 * Segment-boundary route match: exact, or a real `/` boundary. Deliberately not
 * `String.startsWith`, which would treat `/submitted` as living under
 * `/submit` rather than as its own route.
 */
export function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function shouldShowMobilePrimaryNav(pathname: string) {
  return !MOBILE_FOCUS_ROUTE_PREFIXES.some((prefix) =>
    matchesRoute(pathname, prefix)
  );
}

export function shouldShowDesktopRail(pathname: string) {
  return !RAIL_SUPPRESSED_PREFIXES.some((prefix) =>
    matchesRoute(pathname, prefix)
  );
}

/** Only publication detail pages opt into immersive mobile reading. */
export function isCompactReadingRoute(pathname: string) {
  return /^\/post\/[^/]+\/?$/.test(pathname);
}

export function isFocusRoute(pathname: string) {
  return MOBILE_FOCUS_ROUTE_PREFIXES.some(prefix => matchesRoute(pathname, prefix));
}
