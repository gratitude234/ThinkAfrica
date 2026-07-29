import { PHASE_LABELS, type DebatePhase } from "@/lib/debatePhases";

// Narrow-screen forms of PHASE_LABELS. The full names ("Opening Statements",
// "Closing Arguments") truncate to "Openin…" once five of them share a phone's
// width, which reads as no label at all.
const PHASE_SHORT_LABELS: Record<DebatePhase, string> = {
  recruiting: "Recruit",
  opening: "Opening",
  rebuttal: "Rebuttal",
  closing: "Closing",
  voting: "Vote",
  completed: "Done",
};

export type DebateStatus = "open" | "active" | "closed" | "cancelled";

const STATUS_STYLES: Record<DebateStatus, string> = {
  open: "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  active: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  closed: "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
  cancelled: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

export function getStatusLabel(status: DebateStatus) {
  if (status === "active") return "Live";
  if (status === "open") return "Open";
  if (status === "cancelled") return "Cancelled";
  return "Closed";
}

export function getVoteSplit(forCount = 0, againstCount = 0) {
  const total = forCount + againstCount;
  const forPct = total > 0 ? Math.round((forCount / total) * 100) : 0;

  return {
    total,
    forCount,
    againstCount,
    forPct,
    againstPct: total > 0 ? 100 - forPct : 0,
  };
}

export function LiveDot({ size = 8 }: { size?: number }) {
  return (
    <span
      className="animate-pulse motion-reduce:animate-none"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#F59E0B",
        flexShrink: 0,
      }}
    />
  );
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
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]} ${className}`}
    >
      {status === "active" && <LiveDot size={7} />}
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
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
        <span>{label}</span>
        <span>{split.total.toLocaleString()}</span>
      </div>
      <div className={`${compact ? "h-2" : "h-3"} flex overflow-hidden rounded-full bg-gray-200`}>
        <span
          className="h-full bg-emerald-brand transition-[width] duration-500"
          style={{ width: `${split.forPct}%` }}
        />
        <span
          className="h-full bg-purple-accent transition-[width] duration-500"
          style={{ width: `${split.againstPct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold">
        <span className="text-emerald-700">
          For {split.total ? `${split.forPct}%` : "0"}
        </span>
        <span className="text-purple-accent">
          Against {split.total ? `${split.againstPct}%` : "0"}
        </span>
      </div>
    </div>
  );
}

export function PhaseStepper({
  currentPhase,
  status,
  variant = "legacy",
}: {
  currentPhase: DebatePhase;
  status: DebateStatus | string;
  variant?: "legacy" | "v1_5";
}) {
  const phases: DebatePhase[] =
    variant === "v1_5"
      ? ["recruiting", "opening", "rebuttal", "voting", "completed"]
      : ["opening", "rebuttal", "closing"];
  const currentIndex = phases.indexOf(currentPhase);
  const isOpen = variant === "legacy" && status === "open";
  const isClosed = status === "closed" || status === "cancelled";

  return (
    <div className="w-full">
      {/* Purely decorative: the numbers, ticks and connector lines restate
          what the labelled list below already says, and on their own they
          announce as a meaningless "1 2 3". */}
      <div aria-hidden="true" className="flex items-center gap-2">
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
              >
                {index < currentIndex && !isOpen ? "✓" : index + 1}
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
      {/* An ordered list rather than a row of spans, so the steps carry their
          own order, names and current-step marker instead of relying on
          position under a decorative circle. */}
      <ol
        aria-label="Debate progress"
        className={`mt-2 grid gap-2 text-[11px] font-medium text-gray-500 ${
          variant === "v1_5" ? "grid-cols-5" : "grid-cols-3"
        }`}
      >
        {phases.map((phase, index) => {
          const done = !isOpen && index < currentIndex;
          const current = !isOpen && !isClosed && phase === currentPhase;

          return (
            <li
              key={phase}
              aria-current={current ? "step" : undefined}
              className={current ? "font-semibold text-emerald-brand" : ""}
            >
              <span aria-hidden="true" className="block truncate sm:hidden">
                {PHASE_SHORT_LABELS[phase]}
              </span>
              <span aria-hidden="true" className="hidden truncate sm:block">
                {PHASE_LABELS[phase]}
              </span>
              <span className="sr-only">
                {`Step ${index + 1} of ${phases.length}: ${PHASE_LABELS[phase]}${
                  done ? " (completed)" : current ? " (current step)" : ""
                }`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StatTile({
  label,
  value,
  tone = "neutral",
  pulse = false,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "emerald" | "amber";
  pulse?: boolean;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-ink";

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-3">
      <div className="flex items-center gap-2">
        {pulse && <LiveDot size={8} />}
        <p className={`text-lg font-bold leading-none ${toneClass}`}>{value}</p>
      </div>
      <p className="mt-1 text-[11px] font-medium text-gray-500">{label}</p>
    </div>
  );
}
