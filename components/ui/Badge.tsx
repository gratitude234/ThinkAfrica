import { POST_TYPE_LABELS } from "@/lib/utils";

interface BadgeProps {
  type: string;
  className?: string;
}

const TYPE_STYLES: Record<string, string> = {
  blog: "bg-emerald-100 text-emerald-800",
  essay: "bg-amber-100 text-amber-700",
  research: "bg-purple-100 text-purple-700",
  policy_brief: "bg-blue-100 text-blue-700",
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
