"use client";

import { useRef } from "react";
import { useCreateChooser } from "./useCreateChooser";
import CreateMobileSheet from "./CreateMobileSheet";
import CreateDesktopPopover from "./CreateDesktopPopover";

interface CreateLauncherProps {
  userId: string | null;
  variant?: "desktop" | "mobileFab";
  isActive?: boolean;
  isPostPage?: boolean;
}

function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ComposeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m11.75 14.25.45-2.35 5.55-5.55a1.6 1.6 0 0 1 2.25 0l.15.15a1.6 1.6 0 0 1 0 2.25l-5.55 5.55-2.35.45.5-2.35"
      />
    </svg>
  );
}

// NavClient's own desktop nav (links, search) switches to its desktop layout
// at `md`; the mobile FAB/hamburger switch back to their mobile layout at
// the same `md` token (see MobileNav.tsx, BottomNav.tsx). The two Create
// controls below must flip at that identical breakpoint -- previously the
// desktop trigger appeared from `sm` (640px) while the mobile FAB only
// disappeared at `md` (768px), so both were visible in the 640-767px gap.
export default function CreateLauncher({
  userId,
  variant = "desktop",
  isActive = false,
  isPostPage = false,
}: CreateLauncherProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const chooser = useCreateChooser({
    variant: variant === "mobileFab" ? "sheet" : "popover",
    triggerRef,
    rootRef,
  });

  if (variant === "mobileFab") {
    return (
      <div className="md:hidden">
        <button
          ref={triggerRef}
          type="button"
          onClick={chooser.toggle}
          className="group fixed right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_8px_20px_-7px_rgb(7_57_41/0.5)] ring-1 ring-black/5 transition-[background-color,box-shadow,transform] duration-200 hover:bg-emerald-700 hover:shadow-[0_10px_24px_-7px_rgb(7_57_41/0.55)] active:scale-[0.96] motion-reduce:transition-none"
          style={{
            // On post pages the mobile ReadingBar pill (ReadingBar.tsx) also floats
            // near the bottom; its top edge lands right at the 72px mark, so it needs
            // extra clearance here to avoid the two overlapping when the pill grows
            // a few px taller than its 56px baseline (larger text-size settings, etc).
            bottom: isPostPage
              ? "calc(112px + env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))"
              : "calc(72px + env(safe-area-inset-bottom) + var(--mobile-visual-viewport-bottom, 0px))",
          }}
          aria-label="Start writing"
          aria-haspopup="dialog"
          aria-expanded={chooser.open}
          aria-controls={chooser.open ? chooser.panelId : undefined}
        >
          <ComposeIcon className="h-[25px] w-[25px] transition-transform duration-200 group-active:scale-95 motion-reduce:transition-none" />
        </button>

        <CreateMobileSheet
          id={chooser.panelId}
          open={chooser.open}
          onClose={chooser.close}
          userId={userId}
        />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative hidden md:inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={chooser.toggle}
        className={`inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors ${
          isActive ? "bg-ink" : "bg-emerald-brand hover:bg-[#0E4B37]"
        }`}
        aria-haspopup="dialog"
        aria-expanded={chooser.open}
        aria-controls={chooser.open ? chooser.panelId : undefined}
      >
        <PlusIcon className="h-3.5 w-3.5" />
        Create
      </button>

      <CreateDesktopPopover
        id={chooser.panelId}
        titleId={chooser.titleId}
        subtitleId={chooser.subtitleId}
        open={chooser.open}
        onClose={chooser.close}
        userId={userId}
      />
    </div>
  );
}
