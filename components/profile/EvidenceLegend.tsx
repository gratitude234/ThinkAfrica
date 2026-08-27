"use client";

import { useEffect, useId, useRef, useState } from "react";
import { INTELLECTUAL_RECORD_LABEL_DEFINITIONS } from "@/lib/intellectualRecord";
import {
  PROFILE_RECORD_METRIC_DISCLAIMER,
  PROFILE_RECORD_METRIC_LIST,
} from "@/lib/profileRecordMetrics";

/**
 * The one place the record explains itself, so it has to actually close.
 *
 * This was a bare `<details>` duplicated in the profile and the record page:
 * no outside-click handling, no Escape, and a fixed 288px panel that ran to
 * the edge of a 360px screen and covered the cards underneath it.
 *
 * It now backs two explanations that used to live in different mechanisms.
 * The evidence chips kept their sentence here; the three record metrics had
 * theirs in a `title` attribute, which is hover-only: no touch, no keyboard,
 * and no screen reader on most combinations. Both are disclosures now, and
 * both read their text from one module, so the profile, the full record and
 * any later surface cannot drift.
 */
function LegendDisclosure({
  triggerLabel,
  panelLabel,
  children,
}: {
  triggerLabel: string;
  panelLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape is a keyboard dismissal, so focus goes back where it came
      // from. An outside click does not restore focus: the pointer has
      // already chosen what to focus next, and stealing it back would undo
      // the click that closed the panel.
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((current) => {
            if (current) triggerRef.current?.focus();
            return !current;
          });
        }}
        aria-expanded={open}
        aria-controls={panelId}
        className="tap-target focus-ring inline-flex items-center py-1 text-xs font-semibold text-ink-soft hover:text-ink"
      >
        {triggerLabel}
      </button>
      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={panelLabel}
          /* Right-anchored and capped against the viewport rather than the
             container, so the panel stays on screen at 390px however far
             right its trigger sits. */
          className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-lg border border-card-border bg-card p-3 text-xs leading-5 text-ink-muted shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The four chips, each with the sentence that defines it.
 *
 * This used to be one generic sentence about what labels are for, which left
 * the actual question ("what does Citable mean?") answerable only by hovering
 * a chip. The definitions come from the same module the chips are built from,
 * so a label and its explanation cannot drift.
 */
const EVIDENCE_LABEL_LIST = Object.values(INTELLECTUAL_RECORD_LABEL_DEFINITIONS);

export default function EvidenceLegend() {
  return (
    <LegendDisclosure
      triggerLabel="Evidence labels"
      panelLabel="What the evidence labels mean"
    >
      <dl className="space-y-2">
        {EVIDENCE_LABEL_LIST.map((label) => (
          <div key={label.key}>
            <dt className="font-semibold text-ink">{label.label}</dt>
            <dd>{label.description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-card-border pt-2">
        Labels describe inspectable evidence attached to a publication. They are
        not popularity scores.
      </p>
    </LegendDisclosure>
  );
}

/**
 * Explains the three numbers at the top of a profile. Available on desktop,
 * touch and keyboard, which the `title` attribute it replaces was not.
 */
export function RecordMetricLegend() {
  return (
    <LegendDisclosure
      triggerLabel="What these mean"
      panelLabel="What the Intellectual Record metrics mean"
    >
      <dl className="space-y-2">
        {PROFILE_RECORD_METRIC_LIST.map((metric) => (
          <div key={metric.key}>
            <dt className="font-semibold text-ink">{metric.label}</dt>
            <dd>{metric.description}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-card-border pt-2">
        {PROFILE_RECORD_METRIC_DISCLAIMER}
      </p>
    </LegendDisclosure>
  );
}
