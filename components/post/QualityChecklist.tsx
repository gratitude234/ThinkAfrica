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

      <div className="mt-4 space-y-4">
        {blockingItems.length > 0 ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-red-600">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Must fix before publishing
            </p>
            <div className="space-y-2">
              {blockingItems.map((item) => (
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
                      item.done ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {item.done ? "OK" : "Fix"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {guidanceItems.length > 0 ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Recommended improvements
            </p>
            <div className="space-y-2">
              {guidanceItems.map((item) => (
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
                      item.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.done ? "OK" : "Improve"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
