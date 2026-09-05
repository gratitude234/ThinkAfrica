/**
 * Every top-level URL segment a username could otherwise shadow.
 *
 * A username is matched by `app/(main)/[username]`, which sits alongside its
 * static siblings, so a member who claimed "login" would not break the login
 * page: the static route wins and their profile becomes unreachable instead.
 * The list is therefore derived from the route tree, not from taste, and
 * `profileUsername.test.ts` walks `app/` to keep it that way as routes are
 * added.
 *
 * Two rules for editing it. Only segments that could be typed as a username
 * belong here, since `getProfileUsernameError` already rejects anything
 * outside [a-z0-9_] (which is why "editorial-standards" is the exception:
 * it predates the rule and is harmless). And a segment stays reserved after
 * its route is retired: "debates" no longer routes anywhere, but releasing it
 * would let someone claim it and make the name unusable if the section ever
 * returns.
 */
export const RESERVED_PROFILE_PATHS = new Set([
  "about",
  "admin",
  "alumni",
  "ambassadors",
  "api",
  "auth",
  "bookmarks",
  "campus",
  "create",
  "dashboard",
  "debates",
  "discover",
  "draft",
  "edit",
  "editorial-standards",
  "explore",
  "fellowships",
  "landing",
  "leaderboard",
  "login",
  "me",
  "messages",
  "notifications",
  "onboarding",
  "opportunities",
  "partners",
  "policy",
  "post",
  "privacy",
  "publication",
  "r",
  "research",
  "responses",
  "review",
  "search",
  "settings",
  "signup",
  "stats",
  "submit",
  "subscriptions",
  "talent",
  "terms",
  "topics",
  "write",
]);

export function normalizeProfileUsername(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function getProfileUsernameError(value: string | null) {
  const username = value?.trim() ?? "";

  if (!username) return "Choose a username.";
  if (!/^[a-z0-9_]+$/.test(username)) {
    return "Use lowercase letters, numbers, and underscores only.";
  }
  if (RESERVED_PROFILE_PATHS.has(username)) {
    return "This username is reserved. Choose another one.";
  }

  return null;
}

export function getUsableProfileUsername(value: string | null) {
  const username = value?.trim() ?? "";
  return getProfileUsernameError(username) ? null : username;
}
