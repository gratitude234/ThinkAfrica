"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  trackActivationEvent,
  type ActivationEventName,
} from "@/lib/activationEvents";

interface DiscoverTrackedLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  ariaCurrent?: "page";
  event?: Extract<
    ActivationEventName,
    "discover_tab_changed" | "discover_item_clicked"
  >;
  metadata?: Record<string, string | number | boolean | null>;
}

export default function DiscoverTrackedLink({
  href,
  children,
  className,
  ariaCurrent,
  event = "discover_item_clicked",
  metadata = {},
}: DiscoverTrackedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      aria-current={ariaCurrent}
      onClick={() => {
        trackActivationEvent({
          event,
          metadata: { href, ...metadata },
        });
      }}
    >
      {children}
    </Link>
  );
}
