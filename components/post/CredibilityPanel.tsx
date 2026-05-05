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

function toneClass(tone: QualityTone | undefined) {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  return "text-gray-700";
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

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Credibility
            </p>
            <h2 className="mt-1 text-sm font-semibold text-gray-900">
              Trust signals
            </h2>
          </div>
          {summary.missingItems.length > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
              More context helps
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              Ready
            </span>
          )}
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-2">
          {compactSignals.map((signal) => (
            <div key={signal.label} className="rounded-lg bg-canvas px-2.5 py-2">
              <dt className="truncate text-[10px] text-gray-400">
                {signal.label}
              </dt>
              <dd className={`mt-1 truncate text-xs font-semibold ${toneClass(signal.tone)}`}>
                {signal.value}
              </dd>
            </div>
          ))}
        </dl>

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

      <div className="hidden sm:block">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Credibility
          </p>
          <h2 className="mt-1 text-sm font-semibold text-gray-900">
            Trust signals for this post
          </h2>
        </div>

        <dl className="mt-4 space-y-3">
          {signals.map((signal) => (
            <div key={signal.label} className="flex items-start justify-between gap-3">
              <dt className="text-xs text-gray-400">{signal.label}</dt>
              <dd className={`max-w-[62%] text-right text-xs font-medium ${toneClass(signal.tone)}`}>
                {signal.value}
              </dd>
            </div>
          ))}
        </dl>

        {summary.missingItems.length > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-900">
              More context can help
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
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
