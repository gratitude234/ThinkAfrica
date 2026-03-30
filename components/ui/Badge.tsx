import { POST_TYPE_LABELS } from "@/lib/utils";

interface BadgeProps {
  type: string;
  className?: string;
}

const TYPE_STYLES: Record<string, string> = {
  blog: "bg-gray-100 text-gray-700",
  essay: "bg-emerald-100 text-emerald-800",
  research: "bg-purple-100 text-purple-800",
  policy_brief: "bg-amber-100 text-amber-800",
};

export default function Badge({ type, className = "" }: BadgeProps) {
  const styles = TYPE_STYLES[type] ?? "bg-gray-100 text-gray-700";
  const label = POST_TYPE_LABELS[type] ?? type;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
