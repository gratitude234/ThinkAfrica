"use client";

import { useEffect } from "react";

export default function Toast({
  message,
  onDone,
  actionLabel,
  onAction,
  durationMs = 4000,
}: {
  message: string;
  onDone: () => void;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDone]);

  return (
    <div
      className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-[110] flex w-[min(calc(100vw-2rem),34rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-gray-950 px-4 py-3 text-sm font-medium text-white shadow-xl animate-slide-up motion-reduce:animate-none"
      role="status"
      aria-live="polite"
    >
      <span className="min-w-0 flex-1 leading-5">{message}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 shrink-0 rounded-lg px-3 font-semibold text-emerald-300 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDone}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Dismiss notification"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
