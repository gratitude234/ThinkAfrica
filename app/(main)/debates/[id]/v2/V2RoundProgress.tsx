import type { DebateRoundStatus } from "@/lib/debateV2";
import { ROUND_PHASE_SHORT_LABELS, ROUND_STATUS_LABELS } from "./labels";
import type { DebateV2RoundView } from "./types";

const STATUS_ICON: Record<DebateRoundStatus, string> = {
  completed: "✓",
  active: "●",
  scheduled: "○",
  cancelled: "✕",
};

function statusClasses(status: DebateRoundStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-brand bg-emerald-50 text-emerald-700";
    case "active":
      return "border-amber-400 bg-amber-50 text-amber-800 ring-2 ring-amber-200";
    case "cancelled":
      return "border-gray-200 bg-gray-50 text-gray-400 line-through";
    default:
      return "border-gray-200 bg-white text-gray-400";
  }
}

export default function V2RoundProgress({ rounds }: { rounds: DebateV2RoundView[] }) {
  return (
    <div
      role="list"
      aria-label="Debate round progress"
      className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:overflow-visible"
    >
      {rounds.map((round) => (
        <div
          role="listitem"
          key={round.id}
          className={`flex min-w-[100px] flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center ${statusClasses(round.status)}`}
        >
          <span className="text-sm font-bold" aria-hidden="true">
            {STATUS_ICON[round.status]}
          </span>
          <span className="text-[11px] font-semibold leading-tight">{ROUND_PHASE_SHORT_LABELS[round.phase]}</span>
          <span className="text-[10px] font-medium">{ROUND_STATUS_LABELS[round.status]}</span>
        </div>
      ))}
    </div>
  );
}
