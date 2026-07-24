"use client";

import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";

interface CreateTriggerProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> {
  userId: string | null;
  children: ReactNode;
}

/**
 * Reusable Create trigger, decoupled from NavClient/BottomNav. Any CTA
 * (Footer "Write", a dashboard "Start writing" button, ...) can render this
 * to get the shared create behavior: guests are routed through the
 * contextual sign-in gate, signed-in users go straight to the Post composer.
 *
 * The composer itself offers the longer-form paths (Article, Research), so
 * ambiguous "Write"/"Create" entry points no longer open a chooser first.
 * Content-specific CTAs (e.g. "Write an article") should keep linking
 * directly to their destination instead of using this.
 */
export default function CreateTrigger({
  userId,
  className,
  children,
  ...rest
}: CreateTriggerProps) {
  const router = useRouter();
  const { requestAuth } = useGuestAuthGate();

  return (
    <button
      type="button"
      onClick={userId ? () => router.push("/create/post") : () => requestAuth("create")}
      className={className}
      {...rest}
    >
      {children}
    </button>
  );
}
