"use client";

import { useEffect, useRef, useState } from "react";

interface HighlightShareProps {
  containerId: string;
}

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

export default function HighlightShare({ containerId }: HighlightShareProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [copied, setCopied] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const hideTooltip = () => {
      setTooltip(null);
      setCopied(false);
    };

    const readSelection = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() ?? "";

      if (
        !selection ||
        selection.rangeCount === 0 ||
        !selectedText ||
        selectedText.length <= 10 ||
        selectedText.length >= 500
      ) {
        hideTooltip();
        return;
      }

      const range = selection.getRangeAt(0);

      if (!container.contains(range.commonAncestorContainer)) {
        hideTooltip();
        return;
      }

      const rect = range.getBoundingClientRect();
      // A selection running to the top of the viewport has no room above it,
      // and on touch the native handles sit right on the range. Flip below
      // when the tooltip would be clipped, and keep it inside the gutters.
      const above = rect.top - 12;
      const flip = above < 56;
      const margin = 76;

      setTooltip({
        text: selectedText,
        top: flip ? rect.bottom + 52 : above,
        left: Math.min(
          Math.max(rect.left + rect.width / 2, margin),
          Math.max(window.innerWidth - margin, margin)
        ),
      });
    };

    /**
     * `selectionchange` rather than `mouseup`.
     *
     * Touch selection never fires `mouseup`, so on a phone this toolbar simply
     * did not exist -- and neither did the keyboard path, since shift+arrow
     * selection does not fire it either. `selectionchange` covers mouse, touch
     * and keyboard alike. It fires continuously while a selection is being
     * dragged, so settle first and read once.
     */
    const handleSelectionChange = () => {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(readSelection, 220);
    };

    const handleDocumentPointerDown = (event: Event) => {
      if (!(event.target instanceof Node)) {
        hideTooltip();
        return;
      }
      if (container.contains(event.target)) return;
      if (tooltipRef.current?.contains(event.target)) return;
      hideTooltip();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [containerId]);

  if (!tooltip) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-20 rounded-xl bg-gray-900 px-1 text-meta text-white shadow-xl"
      style={{
        top: tooltip.top,
        left: tooltip.left,
        transform: "translate(-50%, -100%)",
      }}
    >
      {/* min-h-11 throughout: this is now reachable by touch, where the old
          text-xs targets were well under the 44px floor. */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(`"${tooltip.text}"`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium transition-colors hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset"
        >
          {copied ? "Copied" : "Copy quote"}
        </button>
      </div>
    </div>
  );
}
