"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const hideTooltip = () => {
      setTooltip(null);
      setCopied(false);
    };

    const handleMouseUp = () => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() ?? "";

      if (
        !selection ||
        selection.rangeCount === 0 ||
        !selectedText ||
        selectedText.length <= 10 ||
        selectedText.length >= 280
      ) {
        hideTooltip();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      if (!container.contains(range.commonAncestorContainer)) {
        hideTooltip();
        return;
      }

      setTooltip({
        text: selectedText,
        top: rect.top - 48,
        left: rect.left + rect.width / 2,
      });
    };

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !container.contains(event.target)) {
        hideTooltip();
      }
    };

    container.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousedown", handleDocumentMouseDown);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      container.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, [containerId]);

  if (!tooltip) {
    return null;
  }

  return (
    <div
      className="fixed z-20 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-xl"
      style={{
        top: tooltip.top,
        left: tooltip.left,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const intentUrl = new URL("https://twitter.com/intent/tweet");
            intentUrl.searchParams.set(
              "text",
              `"${tooltip.text}" ${window.location.href}`
            );
            window.open(intentUrl.toString(), "_blank", "noopener,noreferrer");
          }}
          className="transition-colors hover:text-emerald-300"
        >
          🐦 Share on Twitter
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(`"${tooltip.text}"`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="transition-colors hover:text-emerald-300"
        >
          {copied ? "Copied!" : "📋 Copy quote"}
        </button>
      </div>
    </div>
  );
}
