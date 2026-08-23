"use client";

import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";

interface CreateTriggerProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> {
  userId: string | null;
  children: ReactNode;
}

export default function CreateTrigger({ userId, children, ...props }: CreateTriggerProps) {
  const router = useRouter();
  const { requestAuth } = useGuestAuthGate();
  return (
    <button
      type="button"
      onClick={() => userId ? router.push("/write") : requestAuth("create", { destination: "/write" })}
      {...props}
    >
      {children}
    </button>
  );
}
