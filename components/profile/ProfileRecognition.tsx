"use client";

import Link from "next/link";
import {
  groupRecognitionSignals,
  type CredibilitySignal,
  type CredibilityProvenance,
} from "@/lib/credibilityGraph";
import { trackProfileFunnelEvent } from "@/lib/profileFunnel";
import type { ProfileViewerState } from "@/lib/profileFunnel";

/**
 * Where each kind of claim comes from, in words.
 *
 * Provenance is never communicated by a colour or an icon alone. A reader who
 * cannot distinguish a green chip from a gold one still learns that one thing
 * was computed from platform records and another was attested by a named
 * party, because the sentence says so.
 */
const PROVENANCE_COPY: Record<CredibilityProvenance, string> = {
  derived_platform_record: "Counted from records on this platform.",
  verified_by_provider: "Confirmed by the provider and by this author.",
  verified_by_admin: "Verified by an Indegenius administrator.",
};

/**
 * Public recognition: what other people and processes did with this author's
 * work.
 *
 * Bounded and grouped rather than a badge wall. Repeated signals of one kind
 * collapse into a count with a few examples, so a heavily cited author gets a
 * line rather than forty rows. Nothing here is a score, and the section is
 * hidden from visitors entirely when there is nothing to show.
 */
export default function ProfileRecognition({
  signals,
  profileId,
  viewerState,
  isOwnProfile,
}: {
  signals: CredibilitySignal[];
  profileId: string;
  viewerState: ProfileViewerState;
  isOwnProfile: boolean;
}) {
  const groups = groupRecognitionSignals(signals);

  if (groups.length === 0) {
    if (!isOwnProfile) return null;
    return (
      <section
        id="recognition"
        aria-labelledby="recognition-title"
        className="rounded-xl border border-dashed border-card-border bg-card p-5 sm:p-6"
      >
        <h2 id="recognition-title" className="font-display text-xl font-semibold text-ink">
          Recognition
        </h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-6 text-ink-muted">
          Citations from other Indegenius publications, completed reviews,
          accepted collaborations and verified opportunity outcomes appear here
          as they happen. Nothing in this section is self-awarded.
        </p>
      </section>
    );
  }

  return (
    <section id="recognition" aria-labelledby="recognition-title" className="space-y-4">
      <div className="border-b border-card-border pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
          Inspectable
        </p>
        <h2
          id="recognition-title"
          className="font-display mt-1 text-xl font-semibold text-ink"
        >
          Recognition
        </h2>
      </div>

      <ul className="space-y-5">
        {groups.map((group) => (
          <li key={group.kind}>
            <h3 className="text-sm font-semibold text-ink">
              {group.count > 1 ? `${group.label} · ${group.count}` : group.label}
            </h3>
            <p className="mt-1 max-w-[68ch] text-sm leading-6 text-ink-soft">
              {group.explanation}
            </p>
            <ul className="mt-2 space-y-1.5">
              {group.signals.map((signal) => {
                const isInternal = signal.sourceUrl?.startsWith("/");
                const label = signal.relatedWorkTitle
                  ? `${signal.label}: ${signal.relatedWorkTitle}`
                  : signal.label;
                return (
                  <li key={signal.id} className="text-xs leading-5 text-ink-muted">
                    {isInternal ? (
                      <Link
                        href={signal.sourceUrl ?? "#"}
                        onClick={() =>
                          trackProfileFunnelEvent({
                            event: "profile_recognition_source_opened",
                            profileId,
                            viewerState,
                            surface: "recognition",
                          })
                        }
                        /* Describes the evidence being opened, not just
                           "read more". */
                        aria-label={`Open the source for this ${group.label.toLowerCase()}: ${label}`}
                        className="tap-target focus-ring font-medium text-emerald-ink hover:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-soft">{label}</span>
                    )}
                    <span className="ml-1.5">{PROVENANCE_COPY[signal.provenance]}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <p className="text-xs leading-5 text-ink-muted">
        Every item links to its source or names who verified it. Citations
        exclude this author&apos;s own references to their own work. A count is
        not a measure of quality.
      </p>
    </section>
  );
}
