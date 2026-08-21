"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAppChrome } from "@/app/(main)/AppChromeProvider";

// Matches the 1rem of air every sticky aside in the app leaves at its edges,
// and the `+ 1rem` baked into --app-sticky-offset.
const EDGE_GAP = 16;

// The breakpoint at which page.tsx turns the feed into two columns. Below it
// the aside is display:none, so there is nothing to position.
const TWO_COLUMN_MIN = 1024;
const TWO_COLUMN_QUERY = `(min-width: ${TWO_COLUMN_MIN}px)`;

/**
 * The intellectual brief, positioned the way X positions its right column.
 *
 * The column used to pin its top to the nav on the first pixel of scroll and
 * then sit still for the rest of the session, capped at viewport height with
 * its own scrollbar hidden. That made every card past the fold reachable only
 * by hovering the column and scrolling it separately: a second gesture, on a
 * region with no scrollbar to advertise that it was a region. It also meant a
 * wheel event landing on a quarter of the screen moved something other than
 * the feed.
 *
 * So the column scrolls with the document instead, and pins whichever edge the
 * reader is travelling toward. Reading down it rides up until its last card
 * rests on the bottom of the viewport, then holds; reading up the hold
 * releases immediately and its head comes back under the nav. Everything gets
 * seen on the way past, and the page has one scroller again.
 *
 * The mechanism is a sticky `top` walked by the scroll delta rather than a
 * transform. Sticky keeps the browser doing the pinning, so a frame we do not
 * get to run leaves the column correctly placed rather than lagging; and
 * because `top` and the column's own flow position fall at the same rate, the
 * clamp below is the only thing that decides which edge it comes to rest
 * against. When the column is shorter than the space it has -- the common
 * case -- the floor collapses onto the offset and this behaves exactly like
 * the plain sticky it replaces.
 */
export default function BriefColumn({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { navHeight } = useAppChrome();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Guarded the way AppChromeProvider guards its own queries: matchMedia is
    // absent under jsdom, and a missing media query should degrade to a width
    // read rather than take the column down with it.
    const twoColumn = window.matchMedia?.(TWO_COLUMN_QUERY) ?? null;
    const isTwoColumn = () =>
      twoColumn?.matches ?? window.innerWidth >= TWO_COLUMN_MIN;
    const offset = navHeight + EDGE_GAP;

    let top = offset;
    let height = 0;
    let lastY = window.scrollY;
    let frame: number | null = null;

    // Cached rather than read per frame. The scroll callback runs before paint,
    // so an offsetHeight read there forces a synchronous layout on every frame
    // of every scroll; the observers below already know when this can change.
    const measure = () => {
      height = node.offsetHeight;
    };

    const place = () => {
      // Negative once the column outgrows the space beneath the nav. That is
      // the resting place where its last card sits on the bottom edge.
      const floor = Math.min(offset, window.innerHeight - height - EDGE_GAP);
      top = Math.min(offset, Math.max(floor, top));
      node.style.top = `${top}px`;
    };

    const apply = () => {
      frame = null;

      const y = window.scrollY;
      const delta = y - lastY;
      // Synced even when the column is hidden, so that widening the window
      // after a long scroll does not hand the first frame a phantom delta.
      lastY = y;

      if (!isTwoColumn()) {
        node.style.top = "";
        return;
      }

      // One expression covers both directions: reading down walks `top` toward
      // the floor, reading up walks it back toward the offset, and the clamp in
      // place() decides which edge it comes to rest against.
      top -= delta;
      place();
    };

    const onScroll = () => {
      if (frame === null) frame = requestAnimationFrame(apply);
    };

    // A viewport or content change moves the floor without moving the reader,
    // so re-clamp where the column already is rather than resetting it to the
    // top -- a reset would slide the whole column down the screen on every
    // resize tick.
    const remeasure = () => {
      if (!isTwoColumn()) {
        node.style.top = "";
        return;
      }
      measure();
      place();
    };

    remeasure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", remeasure);
    twoColumn?.addEventListener("change", remeasure);

    // Cards land after hydration (unread counts, follow state, a debate that
    // opens), and each one moves the floor. Without this the column keeps
    // resting against a bottom edge it has already outgrown.
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(remeasure)
        : null;
    observer?.observe(node);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", remeasure);
      twoColumn?.removeEventListener("change", remeasure);
      observer?.disconnect();
    };
  }, [navHeight]);

  return (
    // The class keeps the old pin as the pre-hydration position, so the server
    // HTML is never wrong, only less clever. The inline `top` the effect writes
    // outranks it from the first frame after mount.
    <aside
      ref={ref}
      className="hidden self-start lg:sticky lg:top-[var(--app-sticky-offset)] lg:block"
    >
      {children}
    </aside>
  );
}
