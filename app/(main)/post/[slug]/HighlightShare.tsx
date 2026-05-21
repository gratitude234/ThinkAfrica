"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface HighlightShareProps {
  containerId: string;
  postSlug: string;
  postId: string;
}

interface TooltipState {
  text: string;
  top: number;
  left: number;
}

export default function HighlightShare({ containerId, postSlug, postId }: HighlightShareProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [copied, setCopied] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
        selectedText.length >= 500
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
      if (!(event.target instanceof Node)) { hideTooltip(); return; }
      if (container.contains(event.target)) return;
      if (tooltipRef.current?.contains(event.target)) return;
      hideTooltip();
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

  if (!tooltip) return null;

  const handleReply = () => {
    sessionStorage.setItem("write_response_quote", tooltip.text);
    router.push(`/write?response_to=${postSlug}&inResponseTo=${postId}`);
  };

  return (
    <div
      ref={tooltipRef}
      className="fixed z-20 rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-xl"
      style={{
        top: tooltip.top,
        left: tooltip.left,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleReply}
          className="flex items-center gap-1.5 font-medium transition-colors hover:text-emerald-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 010 16H9M3 10l4-4M3 10l4 4" />
          </svg>
          Reply to this
        </button>
        <span className="text-gray-600">·</span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(`"${tooltip.text}"`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="transition-colors hover:text-gray-300"
        >
          {copied ? "Copied!" : "Copy quote"}
        </button>
      </div>
    </div>
  );
}
