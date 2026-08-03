"use client";

import { useEffect, type RefObject } from "react";
import { useAppChrome } from "@/app/(main)/AppChromeProvider";

/**
 * Registers a contextual sticky header and the honest in-flow marker that sits
 * immediately before it. The shared chrome controller uses the marker to wait
 * until the header has genuinely pinned before compacting the mobile chrome.
 */
export function useStickySubnav(
  ref: RefObject<HTMLElement | null>,
  anchorRef?: RefObject<HTMLElement | null>
) {
  const { registerSubnav } = useAppChrome();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    return registerSubnav(node, anchorRef?.current ?? null);
  }, [anchorRef, ref, registerSubnav]);
}
