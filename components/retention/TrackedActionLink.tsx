"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";

interface TrackedActionLinkProps {
  href: string;
  actionKey: string;
  label: string;
  source: string;
  className?: string;
  children: ReactNode;
}

export default function TrackedActionLink({
  href,
  actionKey,
  label,
  source,
  className,
  children,
}: TrackedActionLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackActivationEvent({
          event: "next_action_clicked",
          metadata: {
            actionKey,
            label,
            source,
          },
        });
      }}
    >
      {children}
    </Link>
  );
}
