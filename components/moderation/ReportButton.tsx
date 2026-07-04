"use client";

import { useState } from "react";
import ReportModal from "@/components/moderation/ReportModal";
import type { ReportTargetType } from "@/components/moderation/reportReasons";

interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  variant?: "button" | "text";
  className?: string;
}

export default function ReportButton({
  targetType,
  targetId,
  targetLabel,
  variant = "button",
  className = "",
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "text" ? (
        <button
          onClick={() => setOpen(true)}
          className={`text-xs text-gray-400 transition-colors hover:text-red-600 ${className}`}
        >
          Report
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 ${className}`}
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z"
            />
          </svg>
          Report
        </button>
      )}
      <ReportModal
        targetType={targetType}
        targetId={targetId}
        targetLabel={targetLabel}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
