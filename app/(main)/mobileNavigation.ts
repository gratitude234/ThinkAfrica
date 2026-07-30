const MOBILE_FOCUS_ROUTE_PREFIXES = [
  "/write",
  "/create",
  "/edit",
  "/submit/research",
] as const;

function matchesRoute(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function shouldShowMobilePrimaryNav(pathname: string) {
  if (pathname.startsWith("/post/")) return false;
  if (/^\/messages\/.+/.test(pathname)) return false;

  return !MOBILE_FOCUS_ROUTE_PREFIXES.some((prefix) =>
    matchesRoute(pathname, prefix)
  );
}
