"use client";

import type { FeedContentFilter } from "@/lib/feedData";

const TYPE_OPTIONS: Array<{ label: string; value: FeedContentFilter }> = [
  { label: "All", value: "all" },
  { label: "Posts", value: "post" },
  { label: "Articles", value: "article" },
  { label: "Research", value: "research" },
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
      aria-pressed={active}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-2 ${
        active
          ? "border-emerald-brand bg-emerald-brand text-white"
          : "border-gray-200 bg-white text-ink-muted hover:border-emerald-brand hover:bg-emerald-50 hover:text-emerald-brand"
      }`}
    >
      {children}
    </button>
  );
}

export default function FeedFilterChips({
  type,
  onTypeChange,
  className = "mb-3",
}: {
  type: FeedContentFilter;
  onTypeChange: (value: FeedContentFilter) => void;
  className?: string;
}) {
  return (
    <div
      // overscroll-x-contain stops a diagonal swipe over the chips from
      // rubber-banding this strip instead of scrolling the feed behind it.
      className={`flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      role="group"
      aria-label="Filter feed by content type"
    >
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
  );
}
