import { ReactNode } from "react";

type PillVariant = "neutral" | "emerald" | "amber" | "purple" | "gray" | "red";
type PillSize = "sm" | "md";

interface PillProps {
  variant?: PillVariant;
  size?: PillSize;
  children: ReactNode;
  className?: string;
}

const VARIANTS: Record<PillVariant, string> = {
  neutral: "bg-gray-100 text-gray-700",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  purple: "bg-purple-100 text-purple-700",
  gray: "bg-gray-100 text-gray-500",
  red: "bg-red-100 text-red-700",
};

const SIZES: Record<PillSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

export default function Pill({
  variant = "neutral",
  size = "sm",
  children,
  className = "",
}: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </span>
  );
}
