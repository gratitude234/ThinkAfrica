"use client";

import { useState } from "react";
import type { FeedTimeframe } from "@/lib/feedData";

type TypeFilter = "all" | "research" | "essay" | "policy_brief" | "blog";

const TYPE_OPTIONS: Array<{ label: string; value: TypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Research", value: "research" },
  { label: "Argument", value: "essay" },
  { label: "Policy Brief", value: "policy_brief" },
  { label: "Quick Take", value: "blog" },
];

const TIMEFRAME_OPTIONS: Array<{ label: string; value: FeedTimeframe }> = [
  { label: "All time", value: "all" },
  { label: "This week", value: "week" },
  { label: "This month", value: "month" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-brand text-white"
          : "border border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
      }`}
    >
      {children}
    </button>
  );
}

export default function FeedFilterChips({
  type,
  timeframe,
  onTypeChange,
  onTimeframeChange,
}: {
  type: TypeFilter;
  timeframe: FeedTimeframe;
  onTypeChange: (value: TypeFilter) => void;
  onTimeframeChange: (value: FeedTimeframe) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mb-3 inline-flex items-center rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 sm:hidden"
      >
        Filters {open ? "▴" : "▾"}
      </button>

      <div className={`${open ? "block" : "hidden"} space-y-3 sm:block`}>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={type === option.value}
              onClick={() => onTypeChange(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {TIMEFRAME_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={timeframe === option.value}
              onClick={() => onTimeframeChange(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
