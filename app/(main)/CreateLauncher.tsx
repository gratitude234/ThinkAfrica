"use client";

import Link from "next/link";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import { WriteIcon } from "./navItems";

interface CreateLauncherProps {
  userId: string | null;
  isActive?: boolean;
}

/**
 * The top bar's Write action. On phones Write is a destination in the bottom
 * bar instead, so this is md and up only.
 */
export default function CreateLauncher({ userId, isActive = false }: CreateLauncherProps) {
  const { requestAuth } = useGuestAuthGate();
  const className = `hidden min-h-11 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 md:inline-flex ${isActive ? "bg-ink" : "bg-emerald-brand hover:bg-[#0E4B37]"}`;
  const children = (
    <>
      <WriteIcon className="h-4 w-4" />
      Write
    </>
  );

  if (!userId) {
    return (
      <button type="button" onClick={() => requestAuth("create", { destination: "/write" })} className={className}>
        {children}
      </button>
    );
  }

  return <Link href="/write" className={className}>{children}</Link>;
}
