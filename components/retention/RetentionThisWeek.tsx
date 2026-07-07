import type { RetentionSummary } from "@/lib/retention";
import TrackedActionLink from "./TrackedActionLink";

interface RetentionThisWeekProps {
  summary: RetentionSummary;
  source: "home" | "dashboard";
}

const PANEL_COPY = {
  home: {
    eyebrow: "Welcome back",
    title: "Pick up where the conversation moved",
    source: "home_return_loop",
  },
  dashboard: {
    eyebrow: "Return loop",
    title: "Your next useful move",
    source: "dashboard_return_loop",
  },
} as const;

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
  const { progress, primaryAction, actionItems } = summary;
  const copy = PANEL_COPY[source];

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            {copy.eyebrow}
          </p>
          <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
            {copy.title}
          </h2>
          <p className="mt-1 text-xl font-semibold text-gray-950">
            {primaryAction.label}
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
            {primaryAction.description}
          </p>
        </div>

        <TrackedActionLink
          href={primaryAction.href}
          actionKey={primaryAction.key}
          label={primaryAction.label}
          source={copy.source}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
        >
          {primaryAction.cta}
        </TrackedActionLink>
      </div>

      {actionItems.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {actionItems.map((action) => (
            <div
              key={`${action.key}-${action.href}`}
              className="rounded-lg border border-gray-100 bg-canvas p-3"
            >
              <p className="text-sm font-semibold text-gray-900">
                {action.label}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
                {action.description}
              </p>
              <TrackedActionLink
                href={action.href}
                actionKey={action.key}
                label={action.label}
                source={copy.source}
                className="mt-3 inline-flex text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-800"
              >
                {action.cta}
              </TrackedActionLink>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProgressTile
          label="Posts opened"
          value={progress.postsOpened}
          hint="Reading signals"
        />
        <ProgressTile
          label="Responses"
          value={progress.responseStarts}
          hint="Started this week"
        />
        <ProgressTile
          label="Notifications"
          value={progress.notificationsOpened}
          hint="Opened activity"
        />
        <ProgressTile
          label="Next actions"
          value={progress.returnActionsClicked}
          hint="Return-loop clicks"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ProgressTile
          label="Drafts"
          value={progress.draftsStarted}
          hint="Started"
        />
        <ProgressTile
          label="Submitted"
          value={progress.postsSubmitted}
          hint="Published or reviewed"
        />
        <ProgressTile
          label="Activity"
          value={progress.interactions}
          hint="New signals"
        />
      </div>
    </section>
  );
}
