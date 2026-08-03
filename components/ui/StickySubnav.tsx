"use client";

import { useRef, type ReactNode } from "react";
import { useStickySubnav } from "@/lib/useStickySubnav";

/**
 * A page sub-header that pins beneath the nav and retreats off the top with it.
 *
 * Client-only because it has to measure itself, but it takes its contents as
 * children -- so a Server Component can wrap a server-rendered strip in this
 * without any of that strip becoming client code.
 *
 * Client components that already own the element (the debate rooms, the feed's
 * control strip) call useStickySubnav directly instead of nesting another div.
 */
export default function StickySubnav({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  useStickySubnav(ref, anchorRef);

  return (
    <>
      <div ref={anchorRef} aria-hidden="true" />
      <div
        ref={ref}
        data-app-context-nav=""
        data-app-chrome-motion=""
        className={`sticky top-[var(--app-nav-height)] transition-transform duration-200 ease-out motion-reduce:transition-none ${className}`}
      >
        {children}
      </div>
    </>
  );
}
