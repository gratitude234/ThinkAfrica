import { describe, expect, it } from "vitest";
import {
  NAV_MATCH_PREFIXES,
  getProfileNavHref,
  guestAwareHref,
  isAccountNavActive,
  isNavItemActive,
} from "./navItems";

describe("primary destinations", () => {
  it("are exactly Home, Explore, Write and Notifications, plus Profile", () => {
    // Profile is resolved per viewer by isAccountNavActive, so it has no fixed
    // prefix list. Anything else appearing here is a retired product creeping
    // back into the navigation.
    expect(Object.keys(NAV_MATCH_PREFIXES).sort()).toEqual(
      ["explore", "home", "notifications", "write"]
    );
  });
});

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
    // Search and topic pages are discovery surfaces.
    ["/search", NAV_MATCH_PREFIXES.explore, true],
    ["/topics/climate", NAV_MATCH_PREFIXES.explore, true],
    // Segment boundary, not a string prefix.
    ["/explorer", NAV_MATCH_PREFIXES.explore, false],

    ["/write", NAV_MATCH_PREFIXES.write, true],
    ["/writer", NAV_MATCH_PREFIXES.write, false],

    ["/notifications", NAV_MATCH_PREFIXES.notifications, true],
    ["/notifications/123", NAV_MATCH_PREFIXES.notifications, true],
    ["/notification", NAV_MATCH_PREFIXES.notifications, false],
  ])("returns %s for %s", (pathname, prefixes, expected) => {
    expect(isNavItemActive(pathname, prefixes)).toBe(expected);
  });
});

describe("getProfileNavHref", () => {
  it("links a signed-in writer straight to their public profile", () => {
    expect(getProfileNavHref({ userId: "user-1", username: "ada" })).toBe("/ada");
  });

  it("never points at the retired record or account hub", () => {
    const href = getProfileNavHref({ userId: "user-1", username: "ada" });
    expect(href).not.toContain("/record");
    expect(href).not.toBe("/me");
  });

  it("sends a writer with no usable username to profile settings", () => {
    expect(getProfileNavHref({ userId: "user-1", username: null })).toBe(
      "/settings/profile"
    );
    expect(getProfileNavHref({ userId: "user-1", username: "bad username" })).toBe(
      "/settings/profile"
    );
  });

  it("offers sign-up to a guest", () => {
    expect(getProfileNavHref({ userId: null, username: null })).toBe("/signup");
  });
});

describe("guestAwareHref", () => {
  it("passes a signed-in viewer straight through", () => {
    expect(guestAwareHref("user-1", "/notifications")).toBe("/notifications");
  });

  it("routes a guest through sign-in and back", () => {
    expect(guestAwareHref(null, "/notifications")).toBe(
      "/login?redirectTo=%2Fnotifications"
    );
  });
});

describe("isAccountNavActive", () => {
  const signedIn = { userId: "user-1", username: "ada" };

  it.each([
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
    expect(isAccountNavActive("/someone-else", noUsername)).toBe(false);
  });
});
