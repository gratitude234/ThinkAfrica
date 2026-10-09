import type { ReactNode } from "react";

/** Announce loading once; keep decorative placeholders out of the accessibility tree. */
export default function LoadingState({
  label,
  className = "",
  contentClassName = "",
  children,
}: {
  label: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" className={`min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className={`min-w-0 animate-pulse motion-reduce:animate-none ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}
