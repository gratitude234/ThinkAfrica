"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CLOSE_ICON, Icon } from "@/components/editor/editorIcons";
import { useModalFocus } from "./useModalFocus";

interface WriteSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** From md up: "side" is a 420px panel on the right, "dialog" a centred 480px dialog. Both are bottom sheets on a phone. */
  desktop?: "side" | "dialog";
  /** While true, Escape and the close controls do nothing. */
  busy?: boolean;
  /** A dialog whose footer already has a Cancel button leaves out the close button. */
  closeButton?: boolean;
  footer?: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

const FRAME = {
  side: "md:inset-y-0 md:bottom-auto md:left-auto md:right-0 md:h-dvh md:max-h-none md:w-[420px] md:rounded-none md:border-l",
  dialog:
    "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-[480px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
} as const;

/**
 * A panel over the write screens: Sources and Version history slide in on the
 * right, Publish settings is a centred dialog, and on a phone every one of
 * them is a bottom sheet with a grab handle.
 */
export default function WriteSheet({
  open,
  title,
  onClose,
  desktop = "side",
  busy = false,
  closeButton = true,
  footer,
  onKeyDown,
  children,
}: WriteSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Callers pass inline handlers. Routing them through a ref keeps
  // useModalFocus from re-running, and refocusing, on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  const close = useCallback(() => onCloseRef.current(), []);
  useModalFocus(open, dialogRef, close, busy);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Close ${title}`}
        onClick={busy ? undefined : close}
        className="absolute inset-0 bg-ink/50"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-3xl border-divider bg-surface text-ink shadow-2xl ${FRAME[desktop]}`}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-divider md:hidden" aria-hidden="true" />
        <div
          className={`flex shrink-0 items-center justify-between gap-3 px-5 md:px-6 ${
            closeButton ? "pb-2 pt-3 md:pt-5" : "pb-3 pt-5 md:pt-6"
          }`}
        >
          <h2 id={titleId} className="publication-article-title text-xl font-semibold">
            {title}
          </h2>
          {closeButton ? (
            <button
              type="button"
              onClick={close}
              disabled={busy}
              aria-label="Close"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
            >
              <Icon path={CLOSE_ICON} />
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-6">{children}</div>
        {footer ? (
          <div
            className="shrink-0 border-t border-divider px-5 pt-3 md:px-6"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
