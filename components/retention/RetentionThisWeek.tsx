import type { RetentionSummary } from "@/lib/retention";
import TrackedActionLink from "./TrackedActionLink";

interface RetentionThisWeekProps {
  summary: RetentionSummary;
  source: "home" | "dashboard";
}

function ProgressTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-canvas px-4 py-3">
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

export default function RetentionThisWeek({
  summary,
  source,
}: RetentionThisWeekProps) {
  const { progress, nextAction } = summary;

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            This week
          </p>
          <h2 className="mt-2 text-lg font-semibold text-gray-900">
            {nextAction.label}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {nextAction.description}
          </p>
        </div>

        <TrackedActionLink
          href={nextAction.href}
          actionKey={nextAction.key}
          label={nextAction.label}
          source={source}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
        >
          {nextAction.cta}
        </TrackedActionLink>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressTile
          label="Posts opened"
          value={progress.postsOpened}
          hint="Reading signals"
        />
        <ProgressTile
          label="Drafts started"
          value={progress.draftsStarted}
          hint="New contribution"
        />
        <ProgressTile
          label="Submitted"
          value={progress.postsSubmitted}
          hint="Published or reviewed"
        />
        <ProgressTile
          label="Interactions"
          value={progress.interactions}
          hint="Follows, likes, comments"
        />
      </div>
    </section>
  );
}
