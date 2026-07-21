"use client";

type TypeFilter = "all" | "research" | "essay" | "policy_brief" | "blog";

const TYPE_OPTIONS: Array<{ label: string; value: TypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Articles", value: "essay" },
  { label: "Research", value: "research" },
  { label: "Policy Briefs", value: "policy_brief" },
  { label: "Quick Takes", value: "blog" },
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
      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-ink bg-ink text-white"
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
}: {
  type: TypeFilter;
  onTypeChange: (value: TypeFilter) => void;
}) {
  return (
    <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-1 sm:px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
