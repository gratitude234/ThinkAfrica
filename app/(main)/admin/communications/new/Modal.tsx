"use client";

import { useEffect, type ReactNode } from "react";

/**
 * A dialog that becomes a bottom sheet on small screens. The send confirmation
 * is the most consequential surface in the admin, and it has to stay readable
 * on a phone: a centred box that overflows off a 360px screen is how someone
 * confirms a number they never actually read.
 */
export default function Modal({
  label,
  onClose,
  children,
  panelClassName = "max-w-lg",
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/40 backdrop-blur-[2px] sm:items-center sm:p-6"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <div
        className={`relative w-full rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
