"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { usePathname } from "next/navigation";

interface UseCreateChooserOptions {
  /**
   * "popover" wires up its own outside-click + Escape listeners (desktop
   * anchored popover). "sheet" leaves dismissal to the presentational
   * component's own backdrop/Escape handling (mobile bottom sheet already
   * does this itself), so no document listeners are attached here.
   */
  variant?: "popover" | "sheet";
  /**
   * The trigger button ref, declared by the caller with its own `useRef()`
   * and attached via `ref={triggerRef}` on the actual button -- so refs stay
   * local to the component that owns the DOM node (react-hooks/refs) instead
   * of round-tripping through this hook's return value.
   */
  triggerRef: RefObject<HTMLButtonElement | null>;
  /**
   * The element wrapping both the trigger and the popover, used to detect
   * outside clicks. Only meaningful for variant="popover"; the mobile sheet
   * doesn't need it (its own backdrop handles that).
   */
  rootRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Presentation-agnostic Create-chooser state: open/close, focus management,
 * and route-change cleanup. Any trigger (nav bar, Footer "Write", a future
 * "Start writing" CTA, ...) can call this instead of re-implementing the
 * modal/popover open-state contract, then render `CreateMobileSheet` and/or
 * `CreateDesktopPopover` against the returned ids.
 */
export function useCreateChooser({
  variant = "popover",
  triggerRef,
  rootRef,
}: UseCreateChooserOptions) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const subtitleId = useId();
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  // Closing via Escape, an outside click, or a selection returns keyboard
  // focus to the trigger that opened the chooser. A route change is treated
  // as incidental cleanup (e.g. browser back while the popover was open)
  // rather than a dismissal the user initiated from the trigger, so it does
  // not steal focus back.
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function toggle() {
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open || variant !== "popover") return;

    function handlePointerDown(event: PointerEvent) {
      if (
        rootRef?.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant, rootRef]);

  return { open, toggle, close, panelId, titleId, subtitleId };
}
