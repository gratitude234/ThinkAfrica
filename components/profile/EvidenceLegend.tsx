"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The one place that explains what the evidence chips mean, so it has to
 * actually close. This was previously a bare `<details>` duplicated in the
 * profile and the record page: no outside-click handling, no Escape, and a
 * fixed 288px panel that ran to the edge of a 360px screen and covered the
 * cards underneath it.
 */
export default function EvidenceLegend() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="tap-target focus-ring inline-flex items-center py-1 text-xs font-semibold text-ink-soft hover:text-ink"
      >
        Evidence labels
      </button>
      {open ? (
        <div
          role="group"
          aria-label="What the evidence labels mean"
          className="absolute right-0 z-30 mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-lg border border-card-border bg-card p-3 text-xs leading-5 text-ink-muted shadow-lg"
        >
          Labels describe inspectable sources, review, citation records, or accepted co-authorship. They are not popularity scores.
        </div>
      ) : null}
    </div>
  );
}
