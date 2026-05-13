import type { PostQualitySummary, QualityTone } from "@/lib/postQuality";
import ResponseStartLink from "@/components/post/ResponseStartLink";

const PANEL_SIGNALS = new Set([
  "Author",
  "University",
  "Verification",
  "Content type",
  "Review status",
  "References",
  "Citation ID",
  "Responses",
]);

function toneChipClass(tone: QualityTone | undefined) {
  if (tone === "good") return "bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-500";
}

function toneIconClass(tone: QualityTone | undefined) {
  if (tone === "good") return "text-emerald-500";
  if (tone === "warning") return "text-amber-500";
  return "text-gray-300";
}

export default function CredibilityPanel({
  postId,
  summary,
  isPublished,
}: {
  postId: string;
  summary: PostQualitySummary;
  isPublished: boolean;
}) {
  const signals = summary.credibilitySignals.filter((signal) =>
    PANEL_SIGNALS.has(signal.label)
  );
  const compactSignals = signals
    .filter((signal) =>
      ["Content type", "Review status", "Responses"].includes(signal.label)
    )
    .slice(0, 3);

  const overallGood = summary.missingItems.length === 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-black/[0.02]">
      {/* Mobile compact view */}
      <div className="sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Credibility
            </p>
            <h2 className="mt-0.5 text-sm font-semibold text-gray-900">
              Trust signals
            </h2>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              overallGood
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {overallGood ? "Strong" : "Needs context"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {compactSignals.map((signal) => (
            <div key={signal.label} className="rounded-lg bg-white px-2.5 py-2 ring-1 ring-gray-100">
              <p className="truncate text-[10px] text-gray-400">{signal.label}</p>
              <p className={`mt-1 truncate text-[11px] font-semibold ${toneChipClass(signal.tone).split(" ")[1]}`}>
                {signal.value}
              </p>
            </div>
          ))}
        </div>

        {isPublished ? (
          <ResponseStartLink
            postId={postId}
            source="credibility_panel"
            className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-emerald-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            Write a response
          </ResponseStartLink>
        ) : null}
      </div>

      {/* Desktop full view */}
      <div className="hidden sm:block">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
              Credibility
            </p>
            <h2 className="mt-0.5 text-[13px] font-semibold text-gray-900">
              Trust signals
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              overallGood
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            <svg
              className={`h-2.5 w-2.5 ${overallGood ? "text-emerald-500" : "text-amber-500"}`}
              viewBox="0 0 8 8"
              fill="currentColor"
            >
              <circle cx="4" cy="4" r="4" />
            </svg>
            {overallGood ? "Strong" : "Needs context"}
          </span>
        </div>

        <dl className="space-y-2.5">
          {signals.map((signal) => (
            <div key={signal.label} className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <svg
                  className={`h-2 w-2 shrink-0 ${toneIconClass(signal.tone)}`}
                  viewBox="0 0 8 8"
                  fill="currentColor"
                >
                  <circle cx="4" cy="4" r="4" />
                </svg>
                {signal.label}
              </dt>
              <dd
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneChipClass(signal.tone)}`}
              >
                {signal.value}
              </dd>
            </div>
          ))}
        </dl>

        {summary.missingItems.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-amber-900">
              More context can help
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">
              {summary.missingItems.slice(0, 2).join(", ")}
            </p>
          </div>
        ) : null}

        {isPublished ? (
          <ResponseStartLink
            postId={postId}
            source="credibility_panel"
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-brand px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            Write a response
          </ResponseStartLink>
        ) : null}
      </div>
    </section>
  );
}
