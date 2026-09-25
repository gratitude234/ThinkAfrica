"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BACK_ICON, Icon } from "@/components/editor/editorIcons";
import type { ContributionDraft } from "./useContributionDraft";

export type WriteStatusTone = "saving" | "saved" | "error";

export interface WriteStatus {
  label: string;
  tone: WriteStatusTone;
}

/**
 * What the save status says and how it looks. An upload the screen started
 * outranks the save state: it is the thing the writer just did, and a pasted
 * photo gives no other sign until it lands.
 */
export function writeStatus(
  draft: Pick<ContributionDraft, "saveLabel" | "saveState">,
  uploading: boolean
): WriteStatus | null {
  if (uploading) return { label: "Adding image…", tone: "saving" };
  if (!draft.saveLabel) return null;
  if (draft.saveState === "error") return { label: draft.saveLabel, tone: "error" };
  // "idle" with a label is a published edit whose changes the account holds.
  if (draft.saveState === "cloud" || draft.saveState === "idle") return { label: draft.saveLabel, tone: "saved" };
  return { label: draft.saveLabel, tone: "saving" };
}

const DOT: Record<WriteStatusTone, string> = {
  saving: "bg-ink-muted/50",
  saved: "bg-emerald-brand",
  error: "bg-red-600",
};

const STATUS_HINT_MS = 3000;

/**
 * The save status as a dot on a phone, where the header has one row to share
 * with Back, the menu and the main button, and as a dot and a word from md
 * up. A tap on the phone's dot says what it means. A failure is never left to
 * a dot: its message has a line of its own under the header at every size.
 */
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
  /** Shown from md up only. On a phone it belongs in the ••• menu. */
  secondary?: ReactNode;
  primary: ReactNode;
}

/**
 * The one header both write screens use: Back, the save status, the •••
 * menu and the main button. One row on a phone, so the writing gets the room,
 * and from md up only as wide as the writing column, so Back and the main
 * button sit at its edges rather than at the edges of the window.
 */
export default function WriteHeader({
  status,
  onBack,
  hasAppNav,
  heading,
  menu,
  secondary,
  primary,
}: WriteHeaderProps) {
  return (
    <header
      className={`sticky z-30 border-b border-divider bg-canvas/95 backdrop-blur ${
        hasAppNav ? "top-0 md:top-[var(--app-nav-height)]" : "top-0"
      }`}
    >
      {heading ? <h1 className="sr-only">{heading}</h1> : null}
      <div className="mx-auto flex max-w-[680px] items-center gap-1 px-2 py-1 sm:px-6 md:gap-2 md:py-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand"
        >
          <Icon path={BACK_ICON} className="h-4 w-4" />
          Back
        </button>
        <SaveStatus status={status} />
        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          {menu}
          {secondary ? <div className="hidden md:flex">{secondary}</div> : null}
          {primary}
        </div>
      </div>
      {status?.tone === "error" ? (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-sm text-red-700">{status.label}</p>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {status?.label ?? ""}
      </p>
    </header>
  );
}
