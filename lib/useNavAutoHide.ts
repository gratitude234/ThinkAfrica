"use client";

import { useEffect, useState } from "react";

/**
 * Below this the nav is always revealed. The sticky sub-headers have not pinned
 * yet this close to the top, so retreating buys the reader no space and only
 * costs them their bearings. It also has to clear the announcement strip
 * (~27px) so the nav is genuinely pinned whenever this hook can flip.
 */
const REVEAL_FLOOR = 96;

/** Movement under this is trackpad/finger noise, not a change of intent. */
const MIN_DELTA = 6;

interface NavAutoHideOptions {
  revealFloor?: number;
  minDelta?: number;
  /** Restrict auto-hiding to matching widths. Null (the default) is every width. */
  mediaQuery?: string | null;
  /** Force-revealed while true -- focus inside the nav, an open panel. */
  disabled?: boolean;
  /** Any change force-reveals and rebases. Pass the pathname. */
  revealKey?: string;
}

/**
 * True while the primary nav should be retreated off the top of the viewport:
 * the reader is scrolling down, past the reveal floor. Scrolling up by more
 * than the jitter threshold brings it straight back.
 *
 * Unlike useHasScrolled, which only needs a position, this reads a *direction*,
 * so the raw scroll offset has to be sampled rather than debounced into a
 * boolean. rAF coalescing (as in NavigationShell) keeps that to one read per
 * painted frame; the boolean return still spares React the re-renders.
 */
export function useNavAutoHide({
  revealFloor = REVEAL_FLOOR,
  minDelta = MIN_DELTA,
  mediaQuery = null,
  disabled = false,
  revealKey = "",
}: NavAutoHideOptions = {}): boolean {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    // Re-running the effect is itself the reset: a new route, or the nav taking
    // focus, has to put the bar back before anything else happens.
    setIsHidden(false);
    if (disabled) return;

    const query =
      mediaQuery && typeof window.matchMedia === "function"
        ? window.matchMedia(mediaQuery)
        : null;

    let lastY = Math.max(window.scrollY, 0);
    let frame: number | null = null;
    // -1 means "not measured yet". Measuring forces layout, so it is deferred
    // until a position looks out of range -- which also re-measures for free
    // when infinite scroll grows the document underneath us.
    let limit = -1;

    const position = () => {
      const raw = window.scrollY;
      if (limit < 0 || raw > limit) {
        limit = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight
        );
      }
      // iOS rubber-banding reports positions past the real end of the document
      // and then unwinds them, which reads as a reversal the reader never made
      // and flashes the bar in and out. Folding the overscroll region onto its
      // edge kills that. jsdom has no layout engine and reports a limit of 0,
      // so fall through there rather than clamping every position to zero.
      return limit > 0 ? Math.min(Math.max(raw, 0), limit) : Math.max(raw, 0);
    };

    const evaluate = () => {
      if (query && !query.matches) {
        setIsHidden(false);
        return;
      }

      const y = position();
      const delta = y - lastY;
      // Sub-threshold movement accumulates rather than rebasing the baseline,
      // so a slow deliberate drag still eventually reads as a direction.
      if (Math.abs(delta) < minDelta) return;
      lastY = y;

      setIsHidden(y > revealFloor && delta > 0);
    };

    const onScroll = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        evaluate();
      });
    };

    // A resize here is the mobile browser's address bar collapsing, or the
    // keyboard opening, at least as often as it is a real viewport change --
    // the same hazard NavigationShell documents. All of those move scrollY
    // without the reader scrolling, so rebase instead of reading a direction
    // out of the jump.
    const onViewportChange = () => {
      limit = -1;
      lastY = position();
    };

    const onMediaChange = () => {
      onViewportChange();
      setIsHidden(false);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    query?.addEventListener("change", onMediaChange);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      query?.removeEventListener("change", onMediaChange);
    };
  }, [disabled, mediaQuery, minDelta, revealFloor, revealKey]);

  // Derived rather than left to the effect's reset, so focus reveals the nav in
  // the same commit it lands in, not one effect flush later.
  return disabled ? false : isHidden;
}
