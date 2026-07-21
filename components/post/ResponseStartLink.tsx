"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";

export type ResponseIntent = "extend" | "challenge" | "evidence";

export default function ResponseStartLink({
  postId,
  className,
  children = "Write a response",
  source = "post_page",
  responseIntent,
  starter,
}: {
  postId: string;
  className?: string;
  children?: ReactNode;
  source?: string;
  responseIntent?: ResponseIntent;
  starter?: "response";
}) {
  const params = new URLSearchParams({
    inResponseTo: postId,
    kind: "article",
  });

  if (starter) params.set("starter", starter);
  if (responseIntent) params.set("responseIntent", responseIntent);

  return (
    <Link
      href={`/write?${params.toString()}`}
      onClick={() =>
        trackActivationEvent({
          event: "response_started",
          metadata: { postId, source, responseIntent: responseIntent ?? null },
        })
      }
      className={className}
    >
      {children}
    </Link>
  );
}
