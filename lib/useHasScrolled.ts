"use client";

import { useEffect, useState } from "react";

/**
 * True once the page has scrolled past `threshold` pixels.
 *
 * Exists so sticky headers can signal that they are floating above content --
 * a flat pinned bar reads as painted on rather than attached to the page.
 * Extracted from LandingNav, which had the only copy of this; NavClient needed
 * the same behaviour and a second inline copy would have started drifting.
 *
 * Boolean state is its own throttle: the listener fires on every scroll event,
 * but React bails out of re-rendering while the value is unchanged, so there is
 * no need for rAF batching here.
 */
export function useHasScrolled(threshold = 10) {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setHasScrolled(window.scrollY > threshold);

    // Read once on mount. A back-navigation restores scroll position before
    // any scroll event fires, so waiting for the listener would leave the
    // header flat on a page that is already scrolled.
    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hasScrolled;
}
