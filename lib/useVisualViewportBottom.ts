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
 *
 * The keyboard is measured against the box a `position: fixed; bottom: 0`
 * control actually sits in, not against innerHeight or the initial
 * containing block. The root layout sets viewport-fit=cover, and Chrome for
 * Android then extends that box under the gesture bar while counting the
 * gesture bar in neither of those, so an estimate from them came up short by
 * the gesture bar and left every toolbar partly under the keyboard.
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

    const fixedBox = document.createElement("div");
    fixedBox.setAttribute("aria-hidden", "true");
    fixedBox.style.cssText =
      "position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none";
    document.body.appendChild(fixedBox);

    const isEditableFocused = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable
      );
    };

    const syncVisualViewport = (event?: Event) => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        // Only account for the visual viewport shrinking when a keyboard is
        // plausibly open (an editable element is focused). Otherwise this
        // diff also picks up the mobile browser's address/toolbar collapsing
        // on scroll, which shoves fixed bottom UI (e.g. the compose FAB) out
        // of view until that chrome settles.
        if (!isEditableFocused()) {
          root.style.setProperty("--mobile-visual-viewport-bottom", "0px");
          root.removeAttribute("data-mobile-keyboard");
          return;
        }

        const layoutHeight =
          fixedBox.getBoundingClientRect().height ||
          Math.max(window.innerHeight, document.documentElement.clientHeight);
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
        // Ignore browser chrome changes and pinch zoom. OffsetTop is deliberately
        // excluded here: Safari may pan the viewport to keep the input visible.
        const keyboardOpen = layoutHeight - visualViewport.height > 120 &&
          Math.abs((visualViewport.scale ?? 1) - 1) < 0.05;
        root.toggleAttribute("data-mobile-keyboard", keyboardOpen);
        // Reveal the whole composer, including its actions, once on focus/resize.
        // Never fight the reader's manual scrolling.
        if (keyboardOpen && event?.type !== "scroll") {
          const composer = document.activeElement?.closest<HTMLElement>("[data-keyboard-composer]");
          if (composer) {
            const rect = composer.getBoundingClientRect();
            const bottom = visualViewport.offsetTop + visualViewport.height - 16;
            const delta = Math.min(rect.bottom - bottom, rect.top - visualViewport.offsetTop - 16);
            if (delta > 0) window.scrollBy({ top: delta, behavior: "instant" });
          }
        }

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
      fixedBox.remove();
      root.removeAttribute("data-mobile-keyboard");
      root.style.removeProperty("--mobile-visual-viewport-bottom");
    };
  }, []);
}
