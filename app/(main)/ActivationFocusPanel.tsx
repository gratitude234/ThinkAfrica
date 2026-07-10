import Link from "next/link";
import type { ActivationState, ActivationTask } from "@/lib/activation";

interface ActivationFocusPanelProps {
  state: ActivationState;
}

function StepDot({
  task,
  active,
  index,
}: {
  task: ActivationTask;
  active: boolean;
  index: number;
}) {
  return (
    <Link
      href={task.href}
      className={`group flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors ${
        task.done
          ? "border-emerald-100 bg-emerald-50 text-emerald-800"
          : active
            ? "border-emerald-300 bg-white text-ink shadow-sm shadow-emerald-900/[0.04]"
            : "border-gray-200 bg-white text-gray-500 hover:border-emerald-200 hover:text-emerald-700"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
          task.done
            ? "bg-emerald-brand text-white"
            : active
              ? "border border-emerald-brand bg-emerald-50 text-emerald-800"
              : "border border-gray-200 bg-white text-gray-400"
        }`}
      >
        {task.done ? "\u2713" : index + 1}
      </span>
      <span className="whitespace-nowrap">{task.label}</span>
    </Link>
  );
}

export default function ActivationFocusPanel({ state }: ActivationFocusPanelProps) {
  if (state.activated) return null;

  const doneCount = state.tasks.filter((task) => task.done).length;
  const pct = Math.round((doneCount / state.tasks.length) * 100);
  const nextTask = state.nextTask;

  return (
    <section className="mb-5 rounded-xl border border-emerald-100 bg-white p-4 shadow-sm shadow-black/[0.02] sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              First contribution
            </p>
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {doneCount} of {state.tasks.length} complete
            </span>
          </div>

          <h2 className="font-display text-[23px] font-semibold leading-tight text-ink sm:text-[25px]">
            {nextTask?.key === "start"
              ? "Turn one idea into your first quick take"
              : nextTask?.label ?? "Keep building your Indegenius profile"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-muted">
            {nextTask?.description ??
              "Complete the first steps that make your academic profile useful to readers, writers, and opportunity partners."}
          </p>
        </div>

        {nextTask ? (
          <Link
            href={nextTask.href}
            className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] sm:w-auto"
          >
            {nextTask.key === "start" ? "Start quick take" : "Continue"}
          </Link>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>Setup progress</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-emerald-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {state.tasks.map((task, index) => (
          <StepDot
            key={task.key}
            task={task}
            index={index}
            active={task.key === nextTask?.key}
          />
        ))}
      </div>
    </section>
  );
}
