"use client";

import { useLinkStatus } from "next/link";
import { WriteIcon } from "./navItems";

/** Next owns this state, so cancelled and completed navigation reset it. */
export default function PendingWriteIcon({ className }: { className: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" aria-label="Opening your writing space" className={`inline-flex shrink-0 items-center justify-center ${className}`}>
      <span aria-hidden="true" className="h-full w-full rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
    </span>
  ) : <WriteIcon className={className} />;
}
