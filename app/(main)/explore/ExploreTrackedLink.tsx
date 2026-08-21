"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  trackActivationEvent,
  type ActivationEventName,
} from "@/lib/activationEvents";

interface ExploreTrackedLinkProps {
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

export default function ExploreTrackedLink({
  href,
  children,
  className,
  ariaCurrent,
  event = "discover_item_clicked",
  metadata = {},
}: ExploreTrackedLinkProps) {
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
