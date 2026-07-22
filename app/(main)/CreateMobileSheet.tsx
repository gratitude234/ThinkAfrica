"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CreateChooserOptions } from "./CreateChooser";
import { CREATE_CHOOSER_SUBTITLE, CREATE_CHOOSER_TITLE } from "./createActions";

interface CreateMobileSheetProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  userId: string | null;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function CreateMobileSheet({ id, open, onClose, userId }: CreateMobileSheetProps) {
  const titleId = useId();
  const subtitleId = useId();
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

  const sheet = (
    <div className="fixed inset-0 z-[60] md:hidden">
      <div
        className="absolute inset-0 bg-black/40 motion-reduce:transition-none"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id={id}
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 animate-create-sheet-up rounded-t-3xl bg-white shadow-2xl outline-none motion-reduce:animate-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 pt-5 pb-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {CREATE_CHOOSER_TITLE}
            </h2>
            <p id={subtitleId} className="mt-0.5 text-sm text-ink-muted">
              {CREATE_CHOOSER_SUBTITLE}
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

        <CreateChooserOptions userId={userId} size="comfortable" onSelect={onClose} />
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(sheet, document.body) : null;
}
