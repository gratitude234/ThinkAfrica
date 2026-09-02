"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type FieldSelectOption = {
  key: string;
  label: string;
  sublabel?: string;
  description?: string;
  meta?: string;
  disabled?: boolean;
  disabledNote?: string;
};

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-gray-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 8 4 4 4-4" />
    </svg>
  );
}

/**
 * A two-line select. A native <select> can only carry one line per option, and
 * the sender list is unreadable without the address sitting under the name.
 */
export default function FieldSelect({
  ariaLabel,
  value,
  options,
  onChange,
  children,
}: {
  ariaLabel: string;
  value: string;
  options: FieldSelectOption[];
  onChange: (key: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand/40"
      >
        <span className="min-w-0">{children}</span>
        <ChevronIcon />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-30 mt-1 max-h-[340px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => {
            const isSelected = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
                className={`flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors ${
                  option.disabled
                    ? "cursor-not-allowed opacity-55"
                    : "hover:bg-canvas"
                } ${isSelected ? "bg-green-wash" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {option.label}
                  </span>
                  {option.sublabel ? (
                    <span className="mt-0.5 block truncate text-xs text-gray-400">
                      {option.sublabel}
                    </span>
                  ) : null}
                  {option.description ? (
                    <span className="mt-1 block text-xs leading-5 text-gray-500">
                      {option.description}
                    </span>
                  ) : null}
                </span>

                <span className="shrink-0 pt-0.5 text-right">
                  {option.disabled && option.disabledNote ? (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {option.disabledNote}
                    </span>
                  ) : option.meta ? (
                    <span className="text-xs tabular-nums text-gray-400">
                      {option.meta}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
