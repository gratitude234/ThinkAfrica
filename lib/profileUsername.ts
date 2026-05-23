export const RESERVED_PROFILE_PATHS = new Set([
  "about",
  "admin",
  "alumni",
  "ambassadors",
  "bookmarks",
  "dashboard",
  "debates",
  "discover",
  "edit",
  "editorial-standards",
  "explore",
  "fellowships",
  "leaderboard",
  "me",
  "messages",
  "notifications",
  "opportunities",
  "partners",
  "policy",
  "post",
  "privacy",
  "publication",
  "review",
  "search",
  "settings",
  "stats",
  "submit",
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
