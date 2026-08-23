"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";

export type ResponseIntent = "extend" | "challenge" | "evidence";

export default function ResponseStartLink({
  postId,
  className,
  children = "Write a response",
  source = "post_page",
  responseIntent,
  starter,
  onTriggerClick,
  userId,
}: {
  postId: string;
  className?: string;
  children?: ReactNode;
  source?: string;
  responseIntent?: ResponseIntent;
  starter?: "response";
  onTriggerClick?: () => void;
  userId?: string | null;
}) {
  const { requestAuth } = useGuestAuthGate();
  const params = new URLSearchParams({ inResponseTo: postId });
  if (starter) params.set("starter", starter);
  if (responseIntent) params.set("responseIntent", responseIntent);
  const href = `/write?${params.toString()}`;
  const track = () => {
    onTriggerClick?.();
    trackActivationEvent({
      event: "response_started",
      metadata: { postId, source, responseIntent: responseIntent ?? null },
    });
  };

  if (userId === null) {
    return (
      <button type="button" onClick={() => { onTriggerClick?.(); requestAuth("respond", { destination: href }); }} className={className}>
        {children}
      </button>
    );
  }

  return <Link href={href} onClick={track} className={className}>{children}</Link>;
}
