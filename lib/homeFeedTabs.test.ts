import { describe, expect, it } from "vitest";
import {
  HOME_FEED_TABS,
  HOME_FEED_TAB_LABELS,
  isHomeFeedTab,
  visibleHomeFeedTabs,
} from "./homeFeedTabs";

/**
 * Home's primary feed modes, as a contract.
 *
 * For You and Following, in that order, and nothing else. A third mode is a
 * product decision: change this test on purpose, not as a side effect.
 */
describe("Home feed modes", () => {
  it("are For You and Following, in that order, and nothing else", () => {
    expect([...HOME_FEED_TABS]).toEqual(["home", "following"]);
  });

  it("are labelled the way a member reads them", () => {
    expect(HOME_FEED_TABS.map((tab) => HOME_FEED_TAB_LABELS[tab])).toEqual([
      "For You",
      "Following",
    ]);
  });

  it("offers a member both, and a guest For You alone", () => {
    expect(visibleHomeFeedTabs(true)).toEqual(["home", "following"]);
    expect(visibleHomeFeedTabs(false)).toEqual(["home"]);
  });

  it.each(["latest", "subscriptions", "topics", "featured", "citable", "discover", ""])(
    "does not recognize %j as a Home mode",
    (retired) => {
      expect(isHomeFeedTab(retired)).toBe(false);
    }
  );
});
