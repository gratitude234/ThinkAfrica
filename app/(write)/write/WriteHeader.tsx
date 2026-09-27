"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BACK_ICON, Icon } from "@/components/editor/editorIcons";
import type { ContributionDraft } from "./useContributionDraft";

export type WriteStatusTone = "saving" | "saved" | "error";

export interface WriteStatus {
  label: string;
  tone: WriteStatusTone;
}

/** What the save status says and how it looks. */
export function writeStatus(
  draft: Pick<ContributionDraft, "saveLabel" | "saveState">,
  uploading: boolean
): WriteStatus | null {
  if (uploading) return { label: "Adding image…", tone: "saving" };
  if (!draft.saveLabel) return null;
  if (draft.saveState === "error") return { label: draft.saveLabel, tone: "error" };
  if (draft.saveState === "cloud" || draft.saveState === "idle") return { label: draft.saveLabel, tone: "saved" };
  return { label: draft.saveLabel, tone: "saving" };
}

const DOT: Record<WriteStatusTone, string> = {
  saving: "bg-ink-muted/50",
  saved: "bg-emerald-brand",
  error: "bg-red-600",
};

const STATUS_HINT_MS = 3000;

function SaveStatus({ status }: { status: WriteStatus | null }) {
  const [hintShown, setHintShown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  if (!status) return null;
  const dot = <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[status.tone]}`} />;

  const showHint = () => {
    setHintShown(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHintShown(false), STATUS_HINT_MS);
  };

  return (
    <div className="relative flex min-w-0 items-center">
      <button
        type="button"
        onClick={showHint}
        aria-label={`Save status: ${status.label}`}
        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-full md:hidden"
      >
        {dot}
      </button>
      {hintShown ? (
        <p
          aria-hidden="true"
          className="absolute left-0 top-full z-40 mt-1 w-max max-w-[16rem] rounded-lg border border-card-border bg-surface px-3 py-2 text-xs text-ink shadow-lg shadow-ink/10 md:hidden"
        >
          {status.label}
        </p>
      ) : null}
      <p
        aria-hidden="true"
        className={`hidden min-w-0 items-center gap-1.5 text-xs md:flex ${
          status.tone === "error" ? "text-red-600" : "text-ink-muted"
        }`}
      >
        {dot}
        <span className="truncate">{status.tone === "error" ? "Not saved" : status.label}</span>
      </p>
    </div>
  );
}

export interface WriteHeaderProps {
  status: WriteStatus | null;
  onBack: () => void;
  /** /write sits under the app navigation from md up. /edit has none. */
  hasAppNav: boolean;
  /** For screen readers, on a screen with no visible heading of its own. */
  heading?: string;
  /** The ••• menu. */
  menu: ReactNode;
  /** Preview or another secondary action. */
  secondary?: ReactNode;
  primary: ReactNode;
  /** Match the Article mockup, where Preview stays visible on a phone. */
  showSecondaryOnMobile?: boolean;
  /** Move the phone save text to a second row instead of reducing it to a dot. */
  mobileStatusLine?: boolean;
  /** Content placed at the right side of that second mobile row, e.g. Add cover. */
  mobileMeta?: ReactNode;
  /** The Article mockup spans the header across the workspace rather than the 680px body. */
  wide?: boolean;
}

/** Shared Article-style header. The Post composer has its own compact-card header. */
export default function WriteHeader({
  status,
  onBack,
  hasAppNav,
  heading,
  menu,
  secondary,
  primary,
  showSecondaryOnMobile = false,
  mobileStatusLine = false,
  mobileMeta,
  wide = false,
}: WriteHeaderProps) {
  const phoneStatus = status?.tone === "error" ? "Not saved" : status?.label;

  return (
    <header
      className={`sticky z-30 border-b border-divider bg-canvas/95 backdrop-blur ${
        hasAppNav ? "top-0 md:top-[var(--app-nav-height)]" : "top-0"
      }`}
    >
      {heading ? <h1 className="sr-only">{heading}</h1> : null}
      <div
        className={`mx-auto flex items-center gap-1 px-2 py-1 sm:px-6 md:gap-2 md:py-2 ${
          wide ? "max-w-none md:px-10" : "max-w-[680px]"
        }`}
      >
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
        >
          <Icon path={BACK_ICON} className="h-4 w-4" />
          Back
        </button>
        <div className={mobileStatusLine ? "hidden md:block" : undefined}>
          <SaveStatus status={status} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          {menu}
          {secondary ? <div className={showSecondaryOnMobile ? "flex" : "hidden md:flex"}>{secondary}</div> : null}
          {primary}
        </div>
      </div>

      {mobileStatusLine || mobileMeta ? (
        <div className="flex min-h-8 items-center justify-between gap-3 px-4 pb-1 text-[11px] text-ink-muted md:hidden">
          <span className={status?.tone === "error" ? "text-red-600" : undefined}>{phoneStatus ?? ""}</span>
          {mobileMeta}
        </div>
      ) : null}

      {status?.tone === "error" ? (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-sm text-red-700">{status.label}</p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status?.label ?? ""}
      </p>
    </header>
  );
}
