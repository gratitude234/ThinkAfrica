import Link from "next/link";
import type { ActivationState, ActivationTask } from "@/lib/activation";

interface ActivationFocusPanelProps {
  state: ActivationState;
}

function TaskStatusIcon({ task, active }: { task: ActivationTask; active: boolean }) {
  if (task.done) {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-[10px] font-bold text-white">
        {"\u2713"}
      </span>
    );
  }

  return (
    <span
      className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border ${
        active ? "border-emerald-brand bg-emerald-50" : "border-emerald-200 bg-white"
      }`}
      aria-hidden="true"
    />
  );
}

export default function ActivationFocusPanel({ state }: ActivationFocusPanelProps) {
  if (state.activated) return null;

  const doneCount = state.tasks.filter((task) => task.done).length;
  const pct = Math.round((doneCount / state.tasks.length) * 100);
  const nextTask = state.nextTask;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-black/[0.02]">
      <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-emerald-50 bg-white p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            First contribution
          </p>
          <h2 className="font-display mt-2 text-[26px] font-semibold leading-tight text-ink">
            {nextTask?.key === "start"
              ? "Turn one idea into your first quick take"
              : nextTask?.label ?? "Keep building your ThinkAfrica profile"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            {nextTask?.description ??
              "Complete the first steps that make your academic profile useful to readers, writers, and opportunity partners."}
          </p>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span>
                {doneCount} of {state.tasks.length} complete
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-brand transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {nextTask ? (
            <Link
              href={nextTask.href}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 sm:w-auto"
            >
              {nextTask.key === "start" ? "Start quick take" : "Continue"}
            </Link>
          ) : null}
        </div>

        <div className="bg-emerald-50/45 p-4 sm:p-5">
          <div className="grid gap-3 md:grid-cols-2">
            {state.tasks.map((task) => {
              const active = task.key === nextTask?.key;

              return (
                <Link
                  key={task.key}
                  href={task.href}
                  className={`flex min-h-[118px] items-start gap-3 rounded-xl border p-4 text-sm transition-colors ${
                    task.done
                      ? "border-emerald-100 bg-white/85 text-emerald-950"
                      : active
                        ? "border-emerald-300 bg-white text-ink shadow-sm shadow-emerald-900/[0.04]"
                        : "border-transparent bg-white/60 text-ink-muted hover:bg-white"
                  }`}
                >
                  <TaskStatusIcon task={task} active={active} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{task.label}</span>
                    <span className="mt-1 line-clamp-3 block text-xs leading-5 text-gray-500">
                      {task.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
