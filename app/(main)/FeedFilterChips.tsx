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
    <div className={className}>
      <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-canvas px-3.5 sm:hidden">
        <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-gray-600">
          <svg className="h-4 w-4 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
          </svg>
          Content
        </span>
        <select
          aria-label="Filter feed by content type"
          value={type}
          onChange={(event) => onTypeChange(event.target.value as FeedContentFilter)}
          className="min-h-9 max-w-[58%] rounded-lg border-0 bg-white px-3 text-[13px] font-semibold text-ink shadow-sm outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-emerald-brand"
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div
        // Desktop keeps the faster one-click chips. Mobile uses the compact
        // selector above so the sticky feed header is one calm, scannable row.
        className="hidden gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:none] sm:flex [&::-webkit-scrollbar]:hidden"
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
    </div>
  );
}
