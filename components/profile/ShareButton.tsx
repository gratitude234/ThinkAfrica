"use client";

import { useState } from "react";
import Toast from "@/components/ui/Toast";

interface ShareButtonProps {
  label?: string;
  className?: string;
}

export default function ShareButton({
  label = "Share",
  className = "",
}: ShareButtonProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleShare = async () => {
    if (typeof window === "undefined") return;

    const shareUrl = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl });
        return;
      } catch {
        // Fall back to clipboard when native sharing is dismissed or unavailable.
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastMessage("Profile URL copied");
    } catch {
      setToastMessage("Could not copy profile URL");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleShare}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 ${className}`}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M13.75 6.25L16.25 3.75M16.25 3.75H10.625M16.25 3.75V9.375M8.75 5.625H6.5C5.11929 5.625 4 6.74429 4 8.125V13.5C4 14.8807 5.11929 16 6.5 16H11.875C13.2557 16 14.375 14.8807 14.375 13.5V11.25"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {label}
      </button>
      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </>
  );
}
