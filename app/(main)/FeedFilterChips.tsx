"use client";

type TypeFilter = "all" | "research" | "essay" | "policy_brief" | "blog";

const TYPE_OPTIONS: Array<{ label: string; value: TypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Essay", value: "essay" },
  { label: "Research", value: "research" },
  { label: "Policy Brief", value: "policy_brief" },
  { label: "Blog", value: "blog" },
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
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-ink bg-ink text-canvas"
          : "border-gray-200 bg-white text-ink-muted hover:border-gray-400 hover:text-ink"
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
    <div className="mb-6 flex flex-wrap gap-2">
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
