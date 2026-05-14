import Link from "next/link";
import type { PostQualitySummary } from "@/lib/postQuality";

export interface DashboardQualityItem {
  id: string;
  title: string;
  status: string;
  actionHref: string;
  actionLabel: string;
  summary: PostQualitySummary;
}

function statusCopy(status: string) {
  if (status === "pending_revision") return "Revision requested";
  if (status === "pending") return "Under review";
  if (status === "published") return "Published";
  if (status === "draft") return "Draft";
  if (status === "rejected") return "Declined";
  return status.replace("_", " ");
}

export default function QualitySignals({
  items,
}: {
  items: DashboardQualityItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Portfolio signals
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">
            Improve the work selectors are judging
          </h2>
        </div>
        <p className="text-xs text-gray-500">
          References, review status, discussion, saves, and likes.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.map((item) => {
          const missing = item.summary.missingItems[0] ?? "Keep building discussion";
          const engagement = item.summary.credibilitySignals.find(
            (signal) => signal.label === "Saves and likes"
          );
          const discussion = item.summary.credibilitySignals.find(
            (signal) => signal.label === "Discussion"
          );

          return (
            <article
              key={item.id}
              className="rounded-xl border border-gray-100 bg-canvas px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {item.summary.contentLabel} / {statusCopy(item.status)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    item.status === "pending_revision"
                      ? "bg-amber-50 text-amber-700"
                      : item.summary.readyForSubmission
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {item.summary.reviewLabel}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-gray-500">References</p>
                  <p className="mt-0.5 font-medium text-gray-800">
                    {item.summary.referenceLabel}
                  </p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-gray-500">Discussion</p>
                  <p className="mt-0.5 font-medium text-gray-800">
                    {discussion?.value ?? "0 comments"}
                  </p>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <p className="text-gray-500">Saves / likes</p>
                  <p className="mt-0.5 font-medium text-gray-800">
                    {engagement?.value ?? "0 saves / 0 likes"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Portfolio next step:{" "}
                  <span className="font-medium text-gray-700">{missing}</span>
                </p>
                <Link
                  href={item.actionHref}
                  className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline"
                >
                  {item.actionLabel}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
