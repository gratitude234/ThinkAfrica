"use client";

import { CreateChooserOptions } from "./CreateChooser";
import { CREATE_CHOOSER_SUBTITLE, CREATE_CHOOSER_TITLE } from "./createActions";

interface CreateDesktopPopoverProps {
  id: string;
  titleId: string;
  subtitleId: string;
  open: boolean;
  onClose: () => void;
  userId: string | null;
  className?: string;
}

const DEFAULT_PANEL_CLASS =
  "absolute right-0 top-[calc(100%+10px)] z-[80] w-[380px] animate-create-menu-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl motion-reduce:animate-none";

export default function CreateDesktopPopover({
  id,
  titleId,
  subtitleId,
  open,
  onClose,
  userId,
  className,
}: CreateDesktopPopoverProps) {
  if (!open) return null;

  return (
    <div
      id={id}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={subtitleId}
      className={className ?? DEFAULT_PANEL_CLASS}
    >
      <div className="border-b border-gray-100 px-4 py-3">
        <p id={titleId} className="text-sm font-semibold text-ink">
          {CREATE_CHOOSER_TITLE}
        </p>
        <p id={subtitleId} className="mt-0.5 text-xs text-gray-500">
          {CREATE_CHOOSER_SUBTITLE}
        </p>
      </div>
      <CreateChooserOptions userId={userId} size="compact" onSelect={onClose} />
    </div>
  );
}
