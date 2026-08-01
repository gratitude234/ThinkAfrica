"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import GuestBanner from "@/components/ui/GuestBanner";
import SideRail from "./SideRail";
import { shouldShowDesktopRail } from "./navRoutes";

interface AppShellProps {
  showGuestBanner: boolean;
  userId: string | null;
  username: string | null;
  hasActiveDebate: boolean;
  children: ReactNode;
}

const MAIN_BASE =
  "mx-auto max-w-[1240px] px-4 pb-32 pt-6 sm:px-6 md:pb-16 lg:px-8";

// The container only widens on rail routes. Every suppressed route -- messages,
// post pages, debate rooms, admin -- stays at 1240px and is pixel-identical to
// before the rail existed, which is what keeps their full-bleed layouts intact.
const MAIN_WITH_RAIL = `${MAIN_BASE} xl:grid xl:max-w-[1360px] xl:grid-cols-[200px_minmax(0,1fr)] xl:items-start xl:gap-8`;

/**
 * Client shell around the (main) content column.
 *
 * `children` is passed through as a prop rather than imported, so everything
 * inside it stays server-rendered and layout.tsx keeps its Supabase work.
 * `usePathname()` resolves during SSR, so the correct container classes ship in
 * the initial HTML -- no hydration flash and no layout shift.
 */
export default function AppShell({
  showGuestBanner,
  userId,
  username,
  hasActiveDebate,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const showRail = shouldShowDesktopRail(pathname);

  return (
    <main className={showRail ? MAIN_WITH_RAIL : MAIN_BASE}>
      {showRail ? (
        <SideRail
          userId={userId}
          username={username}
          hasActiveDebate={hasActiveDebate}
        />
      ) : null}

      {/* min-w-0 is load-bearing: grid items default to min-width:auto, which
          lets any horizontally scrollable child blow out the column. */}
      <div className="min-w-0">
        {showGuestBanner ? <GuestBanner /> : null}
        {children}
      </div>
    </main>
  );
}
