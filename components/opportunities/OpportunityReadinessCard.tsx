import type { OpportunityReadinessSummary } from "@/lib/opportunityReadiness";
import TrackedActionLink from "@/components/retention/TrackedActionLink";

export default function OpportunityReadinessCard({
  summary,
  source,
}: {
  summary: OpportunityReadinessSummary;
  source: "dashboard" | "profile" | "opportunities";
}) {
  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Opportunity readiness
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-900">
            {summary.statusLabel}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {summary.completedCount} of {summary.totalCount} setup signals are
            complete.
          </p>
        </div>
        <div className="flex min-w-[180px] items-center gap-3 rounded-xl bg-canvas px-4 py-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-brand"
              style={{ width: `${summary.score}%` }}
            />
          </div>
          <p className="text-sm font-bold text-gray-900">{summary.score}%</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {summary.items.map((item) => (
          <div
            key={`${source}-${item.key}`}
            className="rounded-lg border border-gray-100 bg-canvas px-3 py-2"
          >
            <p
              className={`text-xs font-semibold ${
                item.done ? "text-emerald-700" : "text-gray-500"
              }`}
            >
              {item.done ? "Ready" : "Missing"}
            </p>
            <p className="mt-0.5 text-sm font-medium text-gray-900">
              {item.label}
            </p>
          </div>
        ))}
      </div>

      {summary.nextAction ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-emerald-900">
            Next:{" "}
            <span className="font-semibold">{summary.nextAction.label}</span>
          </p>
          <TrackedActionLink
            href={summary.nextAction.actionHref}
            actionKey={summary.nextAction.key}
            label={summary.nextAction.actionLabel}
            source={`opportunity_readiness_${source}`}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
          >
            {summary.nextAction.actionLabel}
          </TrackedActionLink>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          Your opportunity profile is ready to be discovered.
        </div>
      )}
    </section>
  );
}
