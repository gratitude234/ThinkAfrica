import { describe, expect, it } from "vitest";
import { shouldShowMobilePrimaryNav } from "./mobileNavigation";

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
