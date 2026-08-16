"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";

export default function CampusPromptLink({
  promptId,
  source,
  className,
  children,
}: {
  promptId: string;
  source: "campus_hub" | "ambassador_dashboard";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/create/post?prompt=${encodeURIComponent(promptId)}`}
      className={className}
      onClick={() =>
        trackActivationEvent({
          event: "campus_prompt_opened",
          source,
          metadata: { promptId },
        })
      }
    >
      {children}
    </Link>
  );
}
