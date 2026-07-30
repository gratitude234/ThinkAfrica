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
      className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-gray-900 px-5 py-3 text-sm font-medium text-white shadow-lg animate-slide-up"
    >
      <span>{message}</span>
      {hasAction ? (
        <button
          type="button"
          onClick={() => {
            onAction?.();
            onDone();
          }}
          className="cursor-pointer rounded-full px-2 py-0.5 text-sm font-semibold text-emerald-300 underline-offset-2 transition-colors hover:text-emerald-200 hover:underline"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
