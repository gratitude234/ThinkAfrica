import type { CoAuthorProfile } from "@/components/collaboration/CoAuthorPicker";
import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";
import { WRITE_FORMATS } from "./writeConfig";

interface DraftSignalPreviewProps {
  postType: PostType;
  title: string;
  contentStarted: boolean;
  tags: string[];
  excerpt: string;
  references: PostReferenceRecord[];
  coAuthors: CoAuthorProfile[];
  profileComplete: boolean;
  wordCount: number;
  compact?: boolean;
}

function SignalDot({ active }: { active: boolean }) {
  return (
    <span
      className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
        active ? "bg-emerald-500" : "bg-gray-300"
      }`}
      aria-hidden="true"
    />
  );
}

export default function DraftSignalPreview({
  postType,
  title,
  contentStarted,
  tags,
  excerpt,
  references,
  coAuthors,
  profileComplete,
  wordCount,
  compact = false,
}: DraftSignalPreviewProps) {
  const selectedFormat =
    WRITE_FORMATS.find((item) => item.type === postType) ?? WRITE_FORMATS[0];
  const formalReview = postType === "research" || postType === "policy_brief";
  const hasReferences = references.some((reference) => reference.title?.trim());
  const hasExcerpt = excerpt.trim().length > 0;
  const hasPublishBasics =
    title.trim().length > 0 && contentStarted && tags.length > 0 && profileComplete;
  const reachesFormatDepth = wordCount >= selectedFormat.minWords;
  const reviewReady = formalReview && hasReferences && reachesFormatDepth;

  const signals = [
    {
      label: "Published",
      active: hasPublishBasics,
      helper: hasPublishBasics
        ? hasExcerpt
          ? "This can add a public work signal with a clear feed summary."
          : "This can publish; the feed summary can be generated."
        : "Needs title, body, profile, and topics.",
    },
    {
      label: "Reviewed eligible",
      active: reviewReady,
      helper: formalReview
        ? reviewReady
          ? "Ready to enter the reviewed-work path."
          : "Needs reviewed format depth and references."
        : "Choose Policy Brief or Research for formal review.",
    },
    {
      label: "Citable path",
      active: formalReview,
      helper: formalReview
        ? "Citation appears only after editorial approval."
        : "Direct-publish formats do not create a citation by default.",
    },
    {
      label: "Co-author",
      active: coAuthors.length > 0,
      helper:
        coAuthors.length > 0
          ? `${coAuthors.length} collaborator${coAuthors.length === 1 ? "" : "s"} attached.`
          : "Add collaborators when authorship is shared.",
    },
    {
      label: "Source-backed",
      active: hasReferences,
      helper: hasReferences
        ? `${references.length} reference${references.length === 1 ? "" : "s"} added.`
        : formalReview
          ? "Add at least one reference before review."
          : "Optional, but it strengthens trust.",
    },
  ];

  return (
    <section
      className={
        compact
          ? "rounded-xl border border-emerald-100 bg-emerald-50/70 p-4"
          : "rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Build academic signal
          </p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900">
            {selectedFormat.signalLabel}
          </h3>
          <p className="mt-1 text-xs leading-5 text-emerald-900/75">
            {selectedFormat.portfolioValue}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          {signals.filter((signal) => signal.active).length}/{signals.length}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {signals.map((signal) => (
          <div key={signal.label} className="flex gap-2.5">
            <SignalDot active={signal.active} />
            <div className="min-w-0">
              <p
                className={`text-xs font-semibold ${
                  signal.active ? "text-gray-900" : "text-gray-500"
                }`}
              >
                {signal.label}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-emerald-900/70">
                {signal.helper}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
