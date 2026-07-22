"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { trackActivationEvent } from "@/lib/activationEvents";

export type ResponseFormat = "quick" | "long_form";

interface ResponseChooserProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId: string;
  postId: string;
  source: string;
  quickHref: string;
  longFormHref: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The shared response-format chooser: exactly two options, Quick response
 * and Long-form response -- never Research. Deliberately styling-minimal
 * (a single small dialog, not a mobile-sheet/desktop-popover split like
 * the Create chooser) so the forthcoming Claude Design pass can restyle it
 * without needing to touch this behavior: dialog semantics, focus trap,
 * Escape/backdrop dismissal, and the two navigable options.
 */
export default function ResponseChooser({
  id,
  open,
  onClose,
  titleId,
  descriptionId,
  postId,
  source,
  quickHref,
  longFormHref,
}: ResponseChooserProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    container?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  function handleSelect(format: ResponseFormat) {
    trackActivationEvent({
      event: "response_started",
      metadata: { postId, source, format },
    });
    onClose();
  }

  const dialog = (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id={id}
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="relative w-full max-w-sm animate-create-sheet-up rounded-t-2xl bg-white p-4 shadow-2xl outline-none motion-reduce:animate-none sm:animate-create-menu-in sm:rounded-2xl sm:p-5"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-ink">
              Respond
            </h2>
            <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
              How do you want to respond?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-canvas hover:text-ink"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href={quickHref}
            onClick={() => handleSelect("quick")}
            className="flex min-h-[64px] flex-col justify-center rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-brand"
          >
            <span className="text-sm font-semibold text-ink">Quick response</span>
            <span className="mt-0.5 text-xs leading-5 text-ink-muted">
              A short, titleless post — publishes immediately.
            </span>
          </Link>
          <Link
            href={longFormHref}
            onClick={() => handleSelect("long_form")}
            className="flex min-h-[64px] flex-col justify-center rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-brand"
          >
            <span className="text-sm font-semibold text-ink">Long-form response</span>
            <span className="mt-0.5 text-xs leading-5 text-ink-muted">
              A full Article, with its own title.
            </span>
          </Link>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : null;
}
