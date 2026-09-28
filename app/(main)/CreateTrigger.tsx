"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";

interface CreateTriggerProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> {
  userId: string | null;
  children: ReactNode;
}

export default function CreateTrigger({ userId, children, ...props }: CreateTriggerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { requestAuth } = useGuestAuthGate();
  return (
    <button
      type="button"
      onClick={() => userId ? startTransition(() => router.push("/write")) : requestAuth("create", { destination: "/write" })}
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
    >
      {children}
      {pending ? (
        <span role="status" aria-label="Opening your writing space" className="ml-auto inline-flex h-4 w-4 shrink-0">
          <span aria-hidden="true" className="h-full w-full rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" />
        </span>
      ) : null}
    </button>
  );
}
