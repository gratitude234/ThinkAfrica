"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";

export default function ResponseStartLink({
  postId,
  className,
  children = "Write a response",
  source = "post_page",
}: {
  postId: string;
  className?: string;
  children?: ReactNode;
  source?: string;
}) {
  return (
    <Link
      href={`/write?inResponseTo=${postId}&type=essay`}
      onClick={() =>
        trackActivationEvent({
          event: "response_started",
          metadata: { postId, source },
        })
      }
      className={className}
    >
      {children}
    </Link>
  );
}
