import Link from "next/link";
import type { ActivationState } from "@/lib/activation";

interface ActivationFocusPanelProps {
  state: ActivationState;
}

export default function ActivationFocusPanel({ state }: ActivationFocusPanelProps) {
  if (state.activated) return null;

  const doneCount = state.tasks.filter((task) => task.done).length;
  const pct = Math.round((doneCount / state.tasks.length) * 100);
  const nextTask = state.nextTask;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-black/[0.02]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            First contribution
          </p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-semibold leading-tight text-ink">
                {nextTask?.key === "start"
                  ? "Turn one idea into your first quick take"
                  : nextTask?.label ?? "Keep building your ThinkAfrica profile"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                {nextTask?.description ??
                  "Complete the first steps that make your academic profile useful to readers, writers, and opportunity partners."}
              </p>
            </div>
            {nextTask ? (
              <Link
                href={nextTask.href}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                {nextTask.key === "start" ? "Start quick take" : "Continue"}
              </Link>
            ) : null}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span>{doneCount} of {state.tasks.length} complete</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-brand transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-emerald-50 bg-emerald-50/55 p-4 lg:border-l lg:border-t-0">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {state.tasks.map((task) => (
              <Link
                key={task.key}
                href={task.href}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-sm transition-colors ${
                  task.done
                    ? "border-emerald-100 bg-white/80 text-emerald-900"
                    : task.key === nextTask?.key
                      ? "border-emerald-200 bg-white text-ink shadow-sm"
                      : "border-transparent bg-white/55 text-ink-muted hover:bg-white"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    task.done
                      ? "bg-emerald-brand text-white"
                      : "border border-emerald-200 bg-white text-transparent"
                  }`}
                >
                  {"\u2713"}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{task.label}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-gray-500">
                    {task.description}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
