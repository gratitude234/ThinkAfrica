"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackActivationEvent, type ActivationEventName } from "@/lib/activationEvents";

interface LandingTrackedLinkProps {
  href: string;
  event: Extract<
    ActivationEventName,
    "landing_read_clicked" | "landing_signup_clicked"
  >;
  metadata?: Record<string, string | number | boolean | null>;
  className?: string;
  children: ReactNode;
}

export default function LandingTrackedLink({
  href,
  event,
  metadata = {},
  className,
  children,
}: LandingTrackedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackActivationEvent({
          event,
          metadata,
        });
      }}
    >
      {children}
    </Link>
  );
}
