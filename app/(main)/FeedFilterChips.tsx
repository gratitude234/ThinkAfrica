"use client";

import type { FeedContentFilter } from "@/lib/feedData";

const TYPE_OPTIONS: Array<{ label: string; value: FeedContentFilter }> = [
  { label: "All", value: "all" },
  { label: "Posts", value: "post" },
  { label: "Articles", value: "article" },
  { label: "Research", value: "research" },
];

const MOBILE_TYPE_OPTIONS: Array<{ label: string; value: FeedContentFilter }> = [
  { label: "All content", value: "all" },
  { label: "Posts only", value: "post" },
  { label: "Articles only", value: "article" },
  { label: "Research only", value: "research" },
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
      <label className="relative ml-auto flex min-h-11 w-fit max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-gray-800 sm:hidden">
        <span className="sr-only">Filter feed by content type</span>
        <svg className="h-4 w-4 shrink-0 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
        </svg>
        <select
          aria-label="Filter feed by content type"
          value={type}
          onChange={(event) => onTypeChange(event.target.value as FeedContentFilter)}
          className="min-h-9 cursor-pointer appearance-none border-0 bg-transparent py-1 pl-0 pr-5 text-[12.5px] font-semibold text-gray-900 outline-none focus:ring-0"
        >
          {MOBILE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg className="pointer-events-none absolute right-3 h-3.5 w-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
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
