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
  /**
   * Optional inline action, used for undoable operations. When present the toast
   * stays up longer by default so the action is actually reachable.
   */
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}) {
  const hasAction = Boolean(actionLabel && onAction);
  const timeout = hasAction ? Math.max(durationMs, 8000) : durationMs;

  useEffect(() => {
    const timer = setTimeout(onDone, timeout);
    return () => clearTimeout(timer);
  }, [onDone, timeout]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-1/2 z-[110] flex w-[min(calc(100vw-2rem),34rem)] -translate-x-1/2 items-center gap-3 rounded-2xl bg-gray-950 px-4 py-3 text-sm font-medium text-white shadow-xl animate-slide-up motion-reduce:animate-none"
    >
      <span className="min-w-0 flex-1 leading-5">{message}</span>
      {hasAction ? (
        <button
          type="button"
          onClick={() => {
            onAction?.();
            onDone();
          }}
          className="min-h-11 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-semibold text-emerald-300 transition-colors hover:bg-white/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDone}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Dismiss message"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
