"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { usePathname } from "next/navigation";

interface UseResponseChooserOptions {
  /**
   * The trigger button ref, declared by the caller with its own
   * `useRef()` and attached via `ref={triggerRef}` on the actual button --
   * so refs stay local to the component that owns the DOM node
   * (react-hooks/refs) instead of round-tripping through this hook's
   * return value.
   */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Presentation-agnostic Respond-chooser state: open/close and route-change
 * cleanup, mirroring app/(main)/CreateTrigger.tsx's useCreateChooser --
 * every "Respond" entry point (ResponseStartLink, reused across the post
 * page, comments, and the credibility panel) shares this one hook instead
 * of re-implementing the open-state contract.
 */
export function useResponseChooser({ triggerRef }: UseResponseChooserOptions) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  // Closing via Escape, an outside click, or a selection returns keyboard
  // focus to the trigger that opened the chooser. A route change is
  // treated as incidental cleanup rather than a dismissal the user
  // initiated from the trigger, so it does not steal focus back.
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

  return { open, toggle, close, panelId, titleId, descriptionId };
}
