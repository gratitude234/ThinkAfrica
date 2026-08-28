"use client";

import Link from "next/link";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";

interface CreateLauncherProps {
  userId: string | null;
  variant?: "desktop" | "mobileFab";
  isActive?: boolean;
}

function ComposeIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.75 14.25.45-2.35 5.55-5.55a1.6 1.6 0 0 1 2.25 0l.15.15a1.6 1.6 0 0 1 0 2.25l-5.55 5.55-2.35.45.5-2.35" />
    </svg>
  );
}

export default function CreateLauncher({ userId, variant = "desktop", isActive = false }: CreateLauncherProps) {
  const { requestAuth } = useGuestAuthGate();
  const mobile = variant === "mobileFab";
  const className = mobile
    ? "group fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-brand text-white shadow-[0_8px_20px_-7px_rgb(7_57_41/0.5)] ring-1 ring-black/5 transition-[bottom,background-color,transform] duration-200 hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 active:scale-[0.96] motion-reduce:transition-none md:hidden"
    : `hidden min-h-11 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 md:inline-flex ${isActive ? "bg-ink" : "bg-emerald-brand hover:bg-[#0E4B37]"}`;
  /* `--profile-sticky-bar-height` is published by the profile sticky bar,
     which is fixed to this same corner and sits below this button in the
     stacking order. Without the term the FAB covered that bar's Follow
     button outright. It resolves to 0px everywhere else, so every other
     screen keeps the resting offset, and the bottom is transitioned so the
     lift travels with the bar rather than snapping. */
  const style = mobile
    ? {
        bottom:
          "calc(72px + env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px) + var(--profile-sticky-bar-height, 0px))",
      }
    : undefined;
  const children = mobile ? (
    <ComposeIcon className="h-[25px] w-[25px]" />
  ) : (
    <><span aria-hidden="true" className="text-base leading-none">+</span>Publish</>
  );

  if (!userId) {
    return (
      <button type="button" onClick={() => requestAuth("create", { destination: "/write" })} className={className} style={style} aria-label={mobile ? "Publish" : undefined}>
        {children}
      </button>
    );
  }

  return <Link href="/write" className={className} style={style} aria-label={mobile ? "Publish" : undefined}>{children}</Link>;
}
