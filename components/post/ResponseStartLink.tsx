"use client";

import Link from "next/link";
import { useRef } from "react";
import type { ReactNode } from "react";
import { trackActivationEvent } from "@/lib/activationEvents";
import { useResponseChooser } from "./useResponseChooser";
import ResponseChooser from "./ResponseChooser";

export type ResponseIntent = "extend" | "challenge" | "evidence";

export default function ResponseStartLink({
  postId,
  className,
  children = "Write a response",
  source = "post_page",
  responseIntent,
  starter,
  onTriggerClick,
}: {
  postId: string;
  className?: string;
  children?: ReactNode;
  source?: string;
  responseIntent?: ResponseIntent;
  starter?: "response";
  /**
   * Optional extra callback fired alongside the trigger click, in addition
   * to (never instead of) opening the chooser / navigating -- lets a
   * caller (e.g. CollaborationPanel) keep its own unrelated click
   * tracking without re-implementing this component.
   */
  onTriggerClick?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chooser = useResponseChooser({ triggerRef });

  // A caller that already declares a specific long-form starter/intent
  // (the argument-stance prompts in ResponsePromptPanel, and the "turn
  // this into a response post" nudges in CommentsSection) has already
  // committed to a structured, long-form contribution -- it keeps going
  // straight to the existing Article-response flow unchanged, exactly as
  // before this chooser existed, since neither concept exists for a
  // titleless Quick response. Only a bare, undecided "Respond" click
  // (no starter/intent) offers the Quick-vs-Long-form choice below.
  if (starter || responseIntent) {
    const params = new URLSearchParams({
      inResponseTo: postId,
      kind: "article",
    });

    if (starter) params.set("starter", starter);
    if (responseIntent) params.set("responseIntent", responseIntent);

    return (
      <Link
        href={`/write?${params.toString()}`}
        onClick={() => {
          onTriggerClick?.();
          trackActivationEvent({
            event: "response_started",
            metadata: { postId, source, responseIntent: responseIntent ?? null },
          });
        }}
        className={className}
      >
        {children}
      </Link>
    );
  }

  const quickHref = `/create/post?${new URLSearchParams({ inResponseTo: postId }).toString()}`;
  const longFormHref = `/write?${new URLSearchParams({
    inResponseTo: postId,
    kind: "article",
  }).toString()}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          onTriggerClick?.();
          chooser.toggle();
        }}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={chooser.open}
        aria-controls={chooser.open ? chooser.panelId : undefined}
      >
        {children}
      </button>
      <ResponseChooser
        id={chooser.panelId}
        open={chooser.open}
        onClose={chooser.close}
        titleId={chooser.titleId}
        descriptionId={chooser.descriptionId}
        postId={postId}
        source={source}
        quickHref={quickHref}
        longFormHref={longFormHref}
      />
    </>
  );
}
