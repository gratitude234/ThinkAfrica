import { describe, expect, it } from "vitest";
import { shouldShowDesktopRail, shouldShowMobilePrimaryNav } from "./navRoutes";

describe("shouldShowMobilePrimaryNav", () => {
  it.each([
    ["/", true],
    ["/explore", true],
    ["/debates/live-room", true],
    ["/messages", true],
    ["/me", true],
    ["/writer", true],
    ["/post/a-published-piece", false],
    ["/edit/a-published-piece", false],
    ["/submit/research", false],
    ["/submit/research/confirm", false],
    ["/create/post", false],
    ["/write", false],
    ["/messages/conversation-1", false],
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
    ["/opportunities", true],
    ["/opportunities/123", true],
    ["/topics/climate", true],
    ["/search", true],
    ["/bookmarks", true],
    ["/notifications", true],
    ["/leaderboard", true],
    ["/dashboard", true],
    ["/fellowships", true],
    ["/alumni", true],
    ["/policy", true],
    // Denylist semantics: routes nobody enumerated still keep the rail, so it
    // doesn't flicker when moving from the feed to a profile.
    ["/settings", true],
    ["/writer", true],
    ["/me", true],
    ["/stats", true],
    // The /-boundary match is load-bearing: /submitted is not under /submit.
    ["/submitted", true],
    // The debates list is a browse surface; rooms and the create flow are not.
    ["/debates", true],
    ["/debates/live-room", false],
    ["/debates/create", false],
    // Layouts that already own the full content width.
    ["/post/a-published-piece", false],
    ["/messages", false],
    ["/messages/conversation-1", false],
    ["/admin", false],
    ["/admin/review", false],
    ["/about", false],
    // Deliberate focus modes.
    ["/write", false],
    ["/create/post", false],
    ["/edit/a-published-piece", false],
    ["/submit/research", false],
  ])("returns %s for %s", (pathname, expected) => {
    expect(shouldShowDesktopRail(pathname)).toBe(expected);
  });
});
