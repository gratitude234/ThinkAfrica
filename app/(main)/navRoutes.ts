const MOBILE_FOCUS_ROUTE_PREFIXES = [
  "/write",
  "/create",
  "/edit",
  "/submit/research",
] as const;

// Routes whose layout already owns the full content width -- they break out of
// the shell container with negative margins, paint viewport-wide bands, or
// render their own left column -- plus the deliberate focus modes. Everything
// else in (main) is a browse surface and keeps the rail, so moving from the
// feed to a profile or to /settings doesn't make the rail flicker in and out.
const RAIL_SUPPRESSED_PREFIXES = [
  "/post",
  "/messages",
  "/admin",
  "/about",
  "/write",
  "/create",
  "/edit",
  "/submit",
] as const;

/**
 * Segment-boundary route match: exact, or a real `/` boundary. Deliberately not
 * `String.startsWith`, which would treat `/submitted` as living under `/submit`
 * and `/debatesomething` as the debates section.
 */
export function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function shouldShowMobilePrimaryNav(pathname: string) {
  if (pathname.startsWith("/post/")) return false;
  if (/^\/messages\/.+/.test(pathname)) return false;

  return !MOBILE_FOCUS_ROUTE_PREFIXES.some((prefix) =>
    matchesRoute(pathname, prefix)
  );
}

export function shouldShowDesktopRail(pathname: string) {
  // /debates is a browse list and keeps the rail; /debates/<anything> is either
  // a debate room or the create flow, and both run their own full-bleed layout.
  if (matchesRoute(pathname, "/debates")) return pathname === "/debates";

  return !RAIL_SUPPRESSED_PREFIXES.some((prefix) =>
    matchesRoute(pathname, prefix)
  );
}
