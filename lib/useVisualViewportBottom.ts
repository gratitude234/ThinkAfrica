"use client";

import { useEffect } from "react";

/**
 * Publishes how much of the layout viewport is currently obscured at the
 * bottom (almost always the mobile soft keyboard) as the CSS variable
 * `--mobile-visual-viewport-bottom` on <html>.
 *
 * Any fixed-to-the-bottom control can then stay above the keyboard with
 * `bottom: calc(... + var(--mobile-visual-viewport-bottom, 0px))`.
 *
 * This lived inline in app/(main)/NavigationShell.tsx, which meant only the
 * (main) route group ever set the variable. The composer lives in (write)
 * behind a passthrough layout, so its fixed formatting toolbar read the
 * fallback 0px and sat underneath the keyboard exactly while someone was
 * typing. Both layouts now call this hook.
 */
export function useVisualViewportBottom() {
  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;

    if (!visualViewport) {
      root.style.setProperty("--mobile-visual-viewport-bottom", "0px");
      return () => root.style.removeProperty("--mobile-visual-viewport-bottom");
    }

    let animationFrame: number | null = null;

    const isEditableFocused = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable
      );
    };

    const syncVisualViewport = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        // Only account for the visual viewport shrinking when a keyboard is
        // plausibly open (an editable element is focused). Otherwise this
        // diff also picks up the mobile browser's address/toolbar collapsing
        // on scroll, which shoves fixed bottom UI (e.g. the compose FAB) out
        // of view until that chrome settles.
        if (!isEditableFocused()) {
          root.style.setProperty("--mobile-visual-viewport-bottom", "0px");
          return;
        }

        const layoutHeight = Math.max(
          window.innerHeight,
          document.documentElement.clientHeight
        );
        const obscuredBottom = Math.max(
          0,
          Math.round(
            layoutHeight - visualViewport.height - visualViewport.offsetTop
          )
        );

        root.style.setProperty(
          "--mobile-visual-viewport-bottom",
          `${obscuredBottom}px`
        );
      });
    };

    syncVisualViewport();
    visualViewport.addEventListener("resize", syncVisualViewport);
    visualViewport.addEventListener("scroll", syncVisualViewport);
    window.addEventListener("resize", syncVisualViewport);
    window.addEventListener("orientationchange", syncVisualViewport);
    document.addEventListener("focusin", syncVisualViewport);
    document.addEventListener("focusout", syncVisualViewport);

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      visualViewport.removeEventListener("resize", syncVisualViewport);
      visualViewport.removeEventListener("scroll", syncVisualViewport);
      window.removeEventListener("resize", syncVisualViewport);
      window.removeEventListener("orientationchange", syncVisualViewport);
      document.removeEventListener("focusin", syncVisualViewport);
      document.removeEventListener("focusout", syncVisualViewport);
      root.style.removeProperty("--mobile-visual-viewport-bottom");
    };
  }, []);
}
