import TrackedActionLink from "@/components/retention/TrackedActionLink";
import type {
  EditorialSignalTone,
  EditorialTrustSummary,
  EditorialTimelineStepStatus,
} from "@/lib/editorialTrust";

const stepClasses: Record<EditorialTimelineStepStatus, string> = {
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  active: "border-amber-200 bg-amber-50 text-amber-800",
  upcoming: "border-gray-200 bg-gray-50 text-gray-500",
};

const signalClasses: Record<EditorialSignalTone, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  gray: "border-gray-200 bg-gray-50 text-gray-600",
};

interface EditorialTrustPanelProps {
  summary: EditorialTrustSummary;
  title?: string;
  description?: string;
  actionHref?: string | null;
  actionSource?: string;
  actionKey?: string;
  compact?: boolean;
}

export default function EditorialTrustPanel({
  summary,
  title = "Review & citation",
  description = "This status explains how formal Indegenius work moves from submission to reviewed publication.",
  actionHref,
  actionSource = "editorial_trust",
  actionKey = "editorial_status",
  compact = false,
}: EditorialTrustPanelProps) {
  if (!summary.applies) return null;

  const visibleSteps = compact
    ? summary.timeline.filter((step) => step.status !== "upcoming").slice(0, 4)
    : summary.timeline;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-black/[0.02] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
            {title}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-950">
            {summary.currentStatusLabel}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
            {description}
          </p>
        </div>
        {actionHref ? (
          <TrackedActionLink
            href={actionHref}
            actionKey={actionKey}
            label={summary.nextActionLabel}
            source={actionSource}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
          >
            {summary.nextActionLabel}
          </TrackedActionLink>
        ) : null}
      </div>

      {summary.publicSignals.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {summary.publicSignals.map((signal) => (
            <span
              key={signal.key}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${signalClasses[signal.tone]}`}
            >
              {signal.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleSteps.map((step) => (
          <div key={step.key} className={`rounded-lg border px-3 py-3 ${stepClasses[step.status]}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{step.label}</p>
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {step.status}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 opacity-80">{step.description}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-gray-500 sm:grid-cols-4">
        <span>Round {summary.reviewRound}</span>
        <span>
          {summary.completedReviewCount}/{Math.max(summary.requiredReviewCount, summary.decisionContext.assignedReviewCount)} reviews complete
        </span>
        <span>{summary.referenceCount} references</span>
        <span>{summary.revisionCount} revisions</span>
      </div>
    </section>
  );
}
