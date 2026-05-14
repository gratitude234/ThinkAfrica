import Link from "next/link";

export interface PortfolioProgressItem {
  key: string;
  label: string;
  value: number;
  target?: number;
  helper: string;
  done: boolean;
}

export interface PortfolioNextAction {
  label: string;
  body: string;
  href: string;
  cta: string;
}

export default function PortfolioProgressCard({
  items,
  nextAction,
}: {
  items: PortfolioProgressItem[];
  nextAction: PortfolioNextAction;
}) {
  const completedCount = items.filter((item) => item.done).length;
  const progress = Math.round((completedCount / items.length) * 100);

  return (
    <section className="mb-6 rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Portfolio progress
          </p>
          <h2 className="mt-2 text-lg font-semibold text-gray-900">
            Build your academic signal
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Published, reviewed, citable, co-authored, and opportunity-ready work
            are the signals external selectors can judge quickly.
          </p>
        </div>
        <div className="flex min-w-[180px] items-center gap-3 rounded-xl bg-canvas px-4 py-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-emerald-brand"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm font-bold text-gray-900">{progress}%</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => (
          <div
            key={item.key}
            className={`rounded-lg border px-3 py-3 ${
              item.done
                ? "border-emerald-100 bg-emerald-50"
                : "border-gray-100 bg-canvas"
            }`}
          >
            <p
              className={`text-2xl font-semibold ${
                item.done ? "text-emerald-800" : "text-gray-900"
              }`}
            >
              {item.value.toLocaleString()}
              {item.target ? (
                <span className="text-sm font-medium text-gray-500">
                  /{item.target.toLocaleString()}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {item.label}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">{item.helper}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-950">
            {nextAction.label}
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-900/75">
            {nextAction.body}
          </p>
        </div>
        <Link
          href={nextAction.href}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          {nextAction.cta}
        </Link>
      </div>
    </section>
  );
}
