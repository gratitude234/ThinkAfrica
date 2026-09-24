/**
 * Home's feed modes.
 *
 * Two, deliberately: For You, which lightly ranks recent publications, and
 * Following, which is the writers a member follows in date order. The
 * publishing reset (Phase 2F) removed Latest, Subscribed and Topics as Home
 * tabs, and Explore is where broader discovery lives. A third mode is a product
 * decision rather than an implementation detail, and
 * lib/publicationsFirstHome.test.ts fails when one appears.
 *
 * Pure, with no server imports, so the server page, the client tabs and the
 * feed API can all share it.
 */
export const HOME_FEED_TABS = ["home", "following"] as const;

export type HomeFeedTab = (typeof HOME_FEED_TABS)[number];

export const HOME_FEED_TAB_LABELS: Record<HomeFeedTab, string> = {
  home: "For You",
  following: "Following",
};

export function isHomeFeedTab(value: unknown): value is HomeFeedTab {
  return (
    typeof value === "string" &&
    (HOME_FEED_TABS as readonly string[]).includes(value)
  );
}

/**
 * The modes a reader can switch between. Following needs a member who can
 * follow someone, so a guest has For You alone, and a single mode is not
 * presented as a choice.
 */
export function visibleHomeFeedTabs(signedIn: boolean): HomeFeedTab[] {
  return signedIn ? [...HOME_FEED_TABS] : ["home"];
}
