"use client";

import { useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useCreateChooser } from "./useCreateChooser";
import CreateMobileSheet from "./CreateMobileSheet";
import CreateDesktopPopover from "./CreateDesktopPopover";

interface CreateTriggerProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "children"> {
  userId: string | null;
  /** "sheet" = full mobile bottom sheet. "popover" = compact anchored popover. */
  presentation: "sheet" | "popover";
  /** Class applied to the popover panel itself (presentation="popover" only). */
  panelClassName?: string;
  children: ReactNode;
}

/**
 * Reusable Create trigger + chooser, decoupled from NavClient/BottomNav.
 * Any CTA (Footer "Write", a future "Start writing" button, ...) can render
 * this instead of linking straight to /write -- it gets the same modal
 * bottom sheet / desktop popover as the nav bar for free, sourced from the
 * same CREATE_ACTIONS, with no duplicated dialog markup.
 *
 * Content-specific CTAs (e.g. "Write an article", "Create a post") should
 * keep linking directly to their destination instead of using this --
 * this component is only for ambiguous "Write"/"Create" entry points that
 * should let the user pick a content type first.
 */
export default function CreateTrigger({
  userId,
  presentation,
  className,
  panelClassName,
  children,
  ...rest
}: CreateTriggerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const chooser = useCreateChooser({ variant: presentation, triggerRef, rootRef });

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={chooser.toggle}
      className={className}
      aria-haspopup="dialog"
      aria-expanded={chooser.open}
      aria-controls={chooser.open ? chooser.panelId : undefined}
      {...rest}
    >
      {children}
    </button>
  );

  if (presentation === "sheet") {
    return (
      <>
        {trigger}
        <CreateMobileSheet
          id={chooser.panelId}
          open={chooser.open}
          onClose={chooser.close}
          userId={userId}
        />
      </>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      {trigger}
      <CreateDesktopPopover
        id={chooser.panelId}
        titleId={chooser.titleId}
        subtitleId={chooser.subtitleId}
        open={chooser.open}
        onClose={chooser.close}
        userId={userId}
        className={panelClassName}
      />
    </div>
  );
}
