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

function FilterIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
    </svg>
  );
}

export function MobileFeedFilterSelect({
  type,
  onTypeChange,
}: {
  type: FeedContentFilter;
  onTypeChange: (value: FeedContentFilter) => void;
}) {
  const activeLabel =
    MOBILE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "All content";

  return (
    <label
      className="relative block h-11 w-11 shrink-0 sm:hidden"
      title={`Content filter: ${activeLabel}`}
    >
      <span className="sr-only">Filter feed by content type</span>
      <select
        aria-label="Filter feed by content type"
        value={type}
        onChange={(event) => onTypeChange(event.target.value as FeedContentFilter)}
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      >
        {MOBILE_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg text-gray-600 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-gold">
        <FilterIcon />
        {type !== "all" ? (
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold"
          />
        ) : null}
      </span>
    </label>
  );
}

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
      <div
        // Desktop keeps the faster one-click chips. Mobile owns a compact
        // selector beside the tab strip, so it does not consume another row.
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
