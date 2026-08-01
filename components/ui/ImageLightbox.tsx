"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

// Marks the history entry pushed on open, so a back gesture closes the viewer
// instead of leaving the page (and losing the reader's place in the feed).
const HISTORY_MARKER = "indegeniusImageViewer";
// Vertical drag distance that dismisses the viewer, matching the swipe-down
// gesture readers expect from a full-screen photo.
const SWIPE_DISMISS_PX = 90;
const DOUBLE_TAP_MS = 300;

export default function ImageLightbox({ src, alt, open, onClose }: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [dragY, setDragY] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dragStartRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);
  // Tracks whether *this* viewer owns the top history entry, so closing by
  // button/Escape rewinds it while closing via back does not double-rewind.
  const pushedHistoryRef = useRef(false);
  // Kept in a ref so the popstate/keydown listeners never need re-binding.
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    setZoomed(false);
    setDragY(0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    const handlePopState = () => {
      pushedHistoryRef.current = false;
      onCloseRef.current();
    };

    window.history.pushState({ [HISTORY_MARKER]: true }, "");
    pushedHistoryRef.current = true;
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (pushedHistoryRef.current) {
        pushedHistoryRef.current = false;
        window.history.back();
      }
    };
  }, [open]);

  // Separate from the open effect: the portal only exists once mounted, so the
  // close button isn't in the DOM yet on the first commit.
  useEffect(() => {
    if (open && mounted) closeButtonRef.current?.focus();
  }, [open, mounted]);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        setZoomed((current) => !current);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
      dragStartRef.current = zoomed ? null : (event.touches[0]?.clientY ?? null);
    },
    [zoomed]
  );

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    if (dragStartRef.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartRef.current;
    setDragY(Math.max(0, delta));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartRef.current !== null && dragY > SWIPE_DISMISS_PX) {
      onCloseRef.current();
    }
    dragStartRef.current = null;
    setDragY(0);
  }, [dragY]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Image: ${alt}` : "Image viewer"}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
      style={dragY > 0 ? { opacity: Math.max(0.35, 1 - dragY / 320) } : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-end gap-1 p-2">
        <button
          type="button"
          onClick={() => setZoomed((current) => !current)}
          aria-pressed={zoomed}
          className="flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-medium text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {zoomed ? "Fit" : "Zoom"}
        </button>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className="flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-white/90 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          ×
        </button>
      </div>

      <div
        className={`flex flex-1 items-center justify-center overflow-auto px-2 pb-2 ${
          zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
        }`}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "pinch-zoom" }}
      >
        {/* Deliberately not next/image: the viewer shows the untouched original
            at its full intrinsic size, which is the whole point of opening it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          onDoubleClick={() => setZoomed((current) => !current)}
          style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
          className={
            zoomed
              ? "w-[180%] max-w-none sm:w-[140%]"
              : "max-h-full max-w-full object-contain"
          }
        />
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-1 text-[13px] text-white/70">
        <p className="min-w-0 truncate">{alt}</p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 py-2 font-medium text-white/90 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Open original
        </a>
      </div>
    </div>,
    document.body
  );
}
