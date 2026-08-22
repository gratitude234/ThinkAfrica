"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ContentKind } from "@/lib/contentModel";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import ContinueDraftRow from "./ContinueDraftRow";

interface ContributionChooserProps {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  userId: string | null;
  id: string;
  titleId: string;
  descriptionId: string;
}

interface ContributionOption {
  kind: ContentKind;
  title: string;
  description: string;
  outcome: string;
  href: string;
  icon: ReactNode;
  accentClass: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const OPTIONS: ContributionOption[] = [
  {
    kind: "post",
    title: "Post",
    description: "Share one focused idea, observation, or question. No title needed.",
    outcome: "Public immediately · up to 2,000 characters",
    href: "/create/post",
    accentClass: "bg-green-tint text-emerald-brand",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h7M7 16h4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-5 3v-5a2 2 0 0 1-1-1.73V5a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
  {
    kind: "article",
    title: "Article",
    description: "Develop a titled, structured argument with sources and richer formatting.",
    outcome: "Saved as a draft until you publish",
    href: "/write?kind=article",
    accentClass: "bg-gold-tint text-gold-ink",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v6h5M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    kind: "research",
    title: "Research",
    description: "Submit a completed scholarly paper and its publication details.",
    outcome: "Sent for editorial review · not published immediately",
    href: "/submit/research",
    accentClass: "bg-purple-tint text-purple-accent",
    icon: (
      <svg fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M10 3v5l-5 9a2.5 2.5 0 0 0 2.18 3.75h9.64A2.5 2.5 0 0 0 19 17l-5-9V3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h9" />
      </svg>
    ),
  },
];

type PositionedStyle = CSSProperties & {
  "--contribution-menu-top": string;
  "--contribution-menu-left": string;
};

/**
 * Shared contribution-format chooser. It behaves as a bottom sheet on
 * smaller screens and is positioned beside the invoking control on desktop.
 * Research is only a destination here; this component has no knowledge of or
 * coupling to the Research submission workflow.
 */
export default function ContributionChooser({
  open,
  onClose,
  triggerRef,
  userId,
  id,
  titleId,
  descriptionId,
}: ContributionChooserProps) {
  const { requestAuth } = useGuestAuthGate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 72, left: 12 });
  const [hasResumableDraft, setHasResumableDraft] = useState(false);
  const handleResumeResolved = useCallback(
    (found: boolean) => setHasResumableDraft(found),
    []
  );

  useEffect(() => {
    if (!open) setHasResumableDraft(false);
  }, [open]);

  // Focus moves once per opening. Kept apart from the positioning effect
  // below so a late-arriving resume row cannot yank focus back to the panel
  // after someone has already tabbed into it.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Likewise separate: re-running the positioning effect while open would
  // otherwise capture its own "hidden" as the value to restore on close.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const panelWidth = Math.min(384, window.innerWidth - 24);
      const panelHeight = panelRef.current?.offsetHeight ?? 390;
      const margin = 12;
      const gap = 8;
      const left = Math.min(
        Math.max(margin, rect.right - panelWidth),
        Math.max(margin, window.innerWidth - panelWidth - margin)
      );
      const below = rect.bottom + gap;
      const top =
        below + panelHeight <= window.innerHeight - margin
          ? below
          : Math.max(margin, rect.top - panelHeight - gap);

      setPosition({ top, left });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // hasResumableDraft is a dependency because showing the resume row changes
    // the panel's height, which decides whether it opens below or above the
    // trigger on desktop.
  }, [open, onClose, triggerRef, hasResumableDraft]);

  if (!open) return null;

  const style: PositionedStyle = {
    "--contribution-menu-top": `${position.top}px`,
    "--contribution-menu-left": `${position.left}px`,
  };

  const chooseAsGuest = (option: ContributionOption) => {
    // close() restores focus to the original launcher before the auth gate
    // records its trigger, so dismissing that second dialog has somewhere
    // stable to return to.
    onClose();
    requestAuth("create", {
      contentKind: option.kind,
      destination: option.href,
    });
  };

  const chooser = (
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:block">
      <div
        className="absolute inset-0 bg-black/40 md:bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        style={style}
        className="relative max-h-[calc(100dvh-1rem)] w-full animate-create-sheet-up overflow-y-auto rounded-t-[22px] bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl outline-none motion-reduce:animate-none md:fixed md:left-[var(--contribution-menu-left)] md:top-[var(--contribution-menu-top)] md:w-96 md:animate-create-menu-in md:rounded-2xl md:border md:border-card-border md:p-4"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-gray-200 md:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4 px-1">
          <div>
            <h2 id={titleId} className="font-display text-lg font-semibold text-ink">
              Create a contribution
            </h2>
            <p id={descriptionId} className="mt-1 text-[13px] leading-5 text-ink-muted">
              Choose the format that fits what you want to share.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close contribution chooser"
            className="-mr-1 -mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <ContinueDraftRow
          userId={userId}
          onNavigate={onClose}
          onResolved={handleResumeResolved}
        />

        <div className={`space-y-2 ${hasResumableDraft ? "mt-2" : "mt-4"}`}>
          {OPTIONS.map((option) => {
            const content = (
              <>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${option.accentClass}`}>
                  <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{option.icon}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{option.title}</span>
                  <span className="mt-0.5 block text-xs leading-[1.45] text-ink-soft">
                    {option.description}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold leading-4 text-ink-muted">
                    {option.outcome}
                  </span>
                </span>
                <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                </svg>
              </>
            );
            const className =
              "flex w-full items-center gap-3 rounded-xl border border-card-border px-3 py-3 text-left transition-[border-color,background-color,transform] hover:border-emerald-brand/30 hover:bg-canvas active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 motion-reduce:transition-none";

            return userId ? (
              <Link key={option.kind} href={option.href} onClick={onClose} className={className}>
                {content}
              </Link>
            ) : (
              <button
                key={option.kind}
                type="button"
                onClick={() => chooseAsGuest(option)}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(chooser, document.body) : null;
}
