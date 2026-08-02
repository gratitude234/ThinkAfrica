"use client";

import { useEffect, type RefObject } from "react";

/**
 * Publishes the measured height of a page's sticky sub-header as
 * `--app-subnav-height`, which is what lets that strip retreat off the top of
 * the viewport together with the nav instead of pinning at 0 once the nav is
 * gone.
 *
 * The retreat itself is pure CSS: the strip pins at `--app-subnav-offset`,
 * which resolves to the nav's live offset while the nav is revealed and to
 * `-height` while it is retreated (globals.css). Because the nav's own sticky
 * top is `--app-subnav-offset - --app-nav-height`, both move the same distance
 * over the same duration -- the nav's bottom edge stays welded to the strip's
 * top edge for the whole animation rather than the two sliding apart.
 *
 * Measured rather than hardcoded for the same reason the nav's height is: the
 * strip grows a row on the Subscriptions tab and its chips wrap at narrow
 * widths, and a stale constant would leave a sliver of it stranded on screen.
 */
export function useStickySubnav(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const root = document.documentElement;
    const publishHeight = () => {
      const height = Math.round(node.getBoundingClientRect().height);
      if (height > 0) {
        root.style.setProperty("--app-subnav-height", `${height}px`);
      }
    };

    publishHeight();

    // Cleared on unmount: a stale height would make the nav on the next page
    // travel further than its own height and leave a gap above the content.
    const clear = () => root.style.removeProperty("--app-subnav-height");

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", publishHeight);
      return () => {
        window.removeEventListener("resize", publishHeight);
        clear();
      };
    }

    const observer = new ResizeObserver(publishHeight);
    observer.observe(node);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [ref]);
}
