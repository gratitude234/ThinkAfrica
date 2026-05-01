import { PHASE_LABELS, type DebatePhase } from "@/lib/debatePhases";

export type DebateStatus = "open" | "active" | "closed";

const STATUS_STYLES: Record<DebateStatus, string> = {
  open: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  active: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  closed: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
};

export function getStatusLabel(status: DebateStatus) {
  if (status === "active") return "Live";
  if (status === "open") return "Open";
  return "Closed";
}

export function getVoteSplit(forCount = 0, againstCount = 0) {
  const total = forCount + againstCount;
  const forPct = total > 0 ? Math.round((forCount / total) * 100) : 50;

  return {
    total,
    forPct,
    againstPct: 100 - forPct,
  };
}

export function DebateStatusPill({
  status,
  className = "",
}: {
  status: DebateStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]} ${className}`}
    >
      {getStatusLabel(status)}
    </span>
  );
}

export function PhasePill({
  phase,
  className = "",
}: {
  phase: DebatePhase;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500 ${className}`}
    >
      {PHASE_LABELS[phase]}
    </span>
  );
}

export function StanceMeter({
  forCount,
  againstCount,
  label = "Community vote",
  compact = false,
}: {
  forCount?: number | null;
  againstCount?: number | null;
  label?: string;
  compact?: boolean;
}) {
  const split = getVoteSplit(forCount ?? 0, againstCount ?? 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        <span>{label}</span>
        <span>{split.total.toLocaleString()}</span>
      </div>
      <div className={`${compact ? "h-2" : "h-3"} flex overflow-hidden rounded-full bg-gray-200`}>
        <span
          className="h-full bg-emerald-brand transition-all duration-500"
          style={{ width: `${split.forPct}%` }}
        />
        <span
          className="h-full bg-amber-500 transition-all duration-500"
          style={{ width: `${split.againstPct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold">
        <span className="text-emerald-700">For {split.forPct}%</span>
        <span className="text-amber-700">Against {split.againstPct}%</span>
      </div>
    </div>
  );
}

export function PhaseStepper({
  currentPhase,
  status,
}: {
  currentPhase: DebatePhase;
  status: DebateStatus | string;
}) {
  const phases: DebatePhase[] = ["opening", "rebuttal", "closing"];
  const currentIndex = phases.indexOf(currentPhase);
  const isOpen = status === "open";
  const isClosed = status === "closed";

  return (
    <div className="w-full">
      <div className="flex items-center gap-2">
        {phases.map((phase, index) => {
          const active = !isOpen && index <= currentIndex;
          const current = !isOpen && !isClosed && phase === currentPhase;

          return (
            <div key={phase} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-emerald-brand text-white"
                    : "bg-gray-100 text-gray-400"
                } ${current ? "ring-4 ring-emerald-100" : ""}`}
                title={PHASE_LABELS[phase]}
              >
                {index + 1}
              </span>
              {index < phases.length - 1 ? (
                <span
                  className={`h-0.5 flex-1 rounded-full ${
                    index < currentIndex && !isOpen
                      ? "bg-emerald-brand"
                      : "bg-gray-200"
                  }`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-medium text-gray-500">
        {phases.map((phase) => (
          <span key={phase} className="truncate">
            {PHASE_LABELS[phase]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-ink";

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
      <p className={`text-lg font-bold leading-none ${toneClass}`}>{value}</p>
      <p className="mt-1 text-[11px] font-medium text-gray-400">{label}</p>
    </div>
  );
}
