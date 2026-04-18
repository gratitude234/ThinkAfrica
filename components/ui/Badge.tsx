import {
  isQuickTake,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";

interface BadgeProps {
  type: string;
  className?: string;
  wordCount?: number;
}

const TYPE_STYLES: Record<string, string> = {
  blog: "bg-emerald-100 text-emerald-800",
  essay: "bg-amber-100 text-amber-700",
  research: "bg-purple-100 text-purple-700",
  policy_brief: "bg-blue-100 text-blue-700",
};

export default function Badge({
  type,
  className = "",
  wordCount,
}: BadgeProps) {
  const styles = TYPE_STYLES[type] ?? "bg-gray-100 text-gray-700";
  const label =
    typeof wordCount === "number" && isQuickTake(type, wordCount)
      ? "Quick Take"
      : POST_TYPE_LABELS[type as PostType] ?? type;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
