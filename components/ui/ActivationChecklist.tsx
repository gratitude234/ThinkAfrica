import Link from "next/link";
import type { ActivationState } from "@/lib/activation";

interface ActivationChecklistProps {
  state: ActivationState;
  compact?: boolean;
}

export default function ActivationChecklist({
  state,
  compact = false,
}: ActivationChecklistProps) {
  const doneCount = state.tasks.filter((task) => task.done).length;
  const pct = Math.round((doneCount / state.tasks.length) * 100);

  if (state.activated) {
    return null;
  }

  return (
    <section className="mb-6 rounded-xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Start your intellectual profile
          </p>
          <h2 className="mt-2 text-lg font-semibold text-gray-900">
            {state.nextTask?.label ?? "Keep building your profile"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {state.nextTask?.description ??
              "Complete the first-week steps that make Indegenius useful."}
          </p>
        </div>

        {state.nextTask ? (
          <Link
            href={state.nextTask.href}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            Continue
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
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {state.tasks.map((task) => (
            <Link
              key={task.key}
              href={task.href}
              className={`flex items-start gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
                task.done
                  ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                  : "border-gray-100 bg-gray-50 text-gray-700 hover:border-emerald-200 hover:bg-white"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  task.done
                    ? "bg-emerald-600 text-white"
                    : "border border-gray-300 text-gray-400"
                }`}
              >
                {task.done ? "OK" : ""}
              </span>
              <span>
                <span className="block font-medium">{task.label}</span>
                <span className="mt-0.5 block text-xs text-gray-500">
                  {task.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
