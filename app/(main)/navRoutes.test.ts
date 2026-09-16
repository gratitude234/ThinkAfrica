import { describe, expect, it } from "vitest";
import { shouldShowDesktopRail, shouldShowMobilePrimaryNav } from "./navRoutes";

describe("shouldShowMobilePrimaryNav", () => {
  it.each([
    ["/", true],
    ["/explore", true],
    ["/notifications", true],
    ["/me", true],
    ["/writer", true],
    ["/post/a-published-piece", false],
    ["/edit/a-published-piece", false],
    ["/create/post", false],
    ["/write", false],
  ])("returns %s for %s", (pathname, expected) => {
    expect(shouldShowMobilePrimaryNav(pathname)).toBe(expected);
  });
});

describe("shouldShowDesktopRail", () => {
  it.each([
    // Browse surfaces keep the rail.
    ["/", true],
    ["/explore", true],
    ["/discover", true],
    ["/topics/climate", true],
    ["/search", true],
    ["/bookmarks", true],
    ["/notifications", true],
    ["/dashboard", true],
    // Denylist semantics: routes nobody enumerated still keep the rail, so it
    // doesn't flicker when moving from the feed to a profile.
    ["/settings", true],
    ["/writer", true],
    ["/me", true],
    ["/submitted", true],
    // The top bar carries no primary destinations, so a post page or an admin
    // page without the rail would leave only the logo as a way back.
    ["/post/a-published-piece", true],
    ["/admin", true],
    ["/admin/moderation", true],
    // Segment boundaries: neither is a suppressed prefix's child.
    ["/aboutness", true],
    ["/writer", true],

    // A layout that already owns the full viewport width.
    ["/about", false],
    // Deliberate focus modes.
    ["/write", false],
    ["/create/post", false],
    ["/edit/a-published-piece", false],
  ])("returns %s for %s", (pathname, expected) => {
    expect(shouldShowDesktopRail(pathname)).toBe(expected);
  });
});
