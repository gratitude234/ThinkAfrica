import { describe, expect, it } from "vitest";
import {
  NAV_MATCH_PREFIXES,
  isAccountNavActive,
  isNavItemActive,
} from "./navItems";

describe("isNavItemActive", () => {
  it.each([
    // Home is exact-only -- a boundary test would light it on every route.
    ["/", NAV_MATCH_PREFIXES.home, true],
    ["/explore", NAV_MATCH_PREFIXES.home, false],
    ["/anything", NAV_MATCH_PREFIXES.home, false],

    ["/explore", NAV_MATCH_PREFIXES.explore, true],
    ["/explore/ai", NAV_MATCH_PREFIXES.explore, true],
    // /discover is the same surface under an older URL.
    ["/discover", NAV_MATCH_PREFIXES.explore, true],
    ["/discover/trending", NAV_MATCH_PREFIXES.explore, true],
    // Segment boundary, not a string prefix.
    ["/explorer", NAV_MATCH_PREFIXES.explore, false],

    ["/debates", NAV_MATCH_PREFIXES.debates, true],
    ["/debates/live-room", NAV_MATCH_PREFIXES.debates, true],
    ["/debatesomething", NAV_MATCH_PREFIXES.debates, false],

    ["/campus", NAV_MATCH_PREFIXES.campus, true],
    ["/campus/programs", NAV_MATCH_PREFIXES.campus, true],
    ["/campuses", NAV_MATCH_PREFIXES.campus, false],

    ["/research", NAV_MATCH_PREFIXES.research, true],
    ["/research/projects/project-one", NAV_MATCH_PREFIXES.research, true],
    ["/researchers", NAV_MATCH_PREFIXES.research, false],

    ["/opportunities", NAV_MATCH_PREFIXES.opportunities, true],
    ["/opportunities/123", NAV_MATCH_PREFIXES.opportunities, true],

    ["/messages", NAV_MATCH_PREFIXES.messages, true],
    ["/messages/conversation-1", NAV_MATCH_PREFIXES.messages, true],
  ])("returns %s for %s", (pathname, prefixes, expected) => {
    expect(isNavItemActive(pathname, prefixes)).toBe(expected);
  });
});

describe("isAccountNavActive", () => {
  const signedIn = { userId: "user-1", username: "ada" };

  it.each([
    ["/me", true],
    ["/me/drafts", true],
    ["/dashboard", true],
    ["/bookmarks", true],
    ["/settings", true],
    // The viewer's own profile counts as an account surface...
    ["/ada", true],
    ["/ada/followers", true],
    // ...but somebody else's profile does not.
    ["/grace", false],
    ["/", false],
    ["/explore", false],
  ])("signed in: returns %s for %s", (pathname, expected) => {
    expect(isAccountNavActive(pathname, signedIn)).toBe(expected);
  });

  it("falls back to the signup route for guests", () => {
    const guest = { userId: null, username: null };
    expect(isAccountNavActive("/signup", guest)).toBe(true);
    expect(isAccountNavActive("/settings", guest)).toBe(false);
  });

  it("skips the profile match when the username is unknown", () => {
    const noUsername = { userId: "user-1", username: null };
    expect(isAccountNavActive("/dashboard", noUsername)).toBe(true);
    expect(isAccountNavActive("/someone-else", noUsername)).toBe(false);
  });
});
