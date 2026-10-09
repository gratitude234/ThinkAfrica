import type { ComponentPropsWithoutRef } from "react";

/** Clamp text and control placeholders to their container, including narrow screens. */
export default function Skeleton({ className = "", ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={`max-w-full rounded bg-divider ${className}`} />;
}
