import type { PostQualitySummary } from "@/lib/postQuality";

export default function QualityChecklist({
  summary,
}: {
  summary: PostQualitySummary;
}) {
  const blockingItems = summary.checklist.filter((item) => item.blocking);
  const guidanceItems = summary.checklist.filter((item) => !item.blocking);

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Quality checklist</p>
          <p className="mt-1 text-xs text-gray-500">
            {summary.requiresReview
              ? "Editorial submissions must clear the required checks."
              : "Quick Takes and essays can stay lightweight, but these signals help readers trust the work."}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            summary.readyForSubmission
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {summary.readyForSubmission ? "Ready" : "Needs fixes"}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {[...blockingItems, ...guidanceItems].map((item) => (
          <div
            key={item.key}
            className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-canvas px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium text-gray-800">{item.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                {item.done ? "Looks good." : item.helper}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                item.done
                  ? "bg-emerald-50 text-emerald-700"
                  : item.blocking
                    ? "bg-red-50 text-red-600"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {item.done ? "OK" : item.blocking ? "Fix" : "Improve"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
