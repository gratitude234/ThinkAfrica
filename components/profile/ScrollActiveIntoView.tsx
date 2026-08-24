"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Keeps the selected item of a horizontally scrolling row visible. Landing on
 * `?type=research` previously showed a filter row that appeared to have nothing
 * selected, because the active tab was off the right edge of a 360px screen.
 *
 * Children stay server-rendered: this only reaches for the element the server
 * already marked with `aria-current`.
 */
export default function ScrollActiveIntoView({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !active) return;

    // Nothing to do when the row is not actually scrollable, and scrolling on
    // load is disorienting rather than helpful in that case.
    if (container.scrollWidth <= container.clientWidth) return;

    const offset =
      active.offsetLeft - (container.clientWidth - active.clientWidth) / 2;
    container.scrollTo({
      left: Math.max(0, offset),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}
