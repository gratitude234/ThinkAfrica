import Link from "next/link";
import { formatTimeUntil } from "@/lib/utils";

export interface DebateInterludeData {
  id: string;
  title: string;
  status?: string | null;
  endsAt?: string | null;
  argumentCount: number;
  motionForCount?: number | null;
  motionAgainstCount?: number | null;
}

export default function DebateInterlude({
  debate,
}: {
  debate: DebateInterludeData;
}) {
  const forCount = debate.motionForCount ?? 0;
  const againstCount = debate.motionAgainstCount ?? 0;
  const totalVotes = forCount + againstCount;
  const forPct = totalVotes > 0 ? Math.round((forCount / totalVotes) * 100) : 50;
  const againstPct = 100 - forPct;
  const remaining = formatTimeUntil(debate.endsAt ?? null);
  const status = debate.status ?? "active";

  return (
    <section className="my-3 rounded-xl bg-gray-900 p-5 text-white">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300">
          {status === "open" ? "Open debate" : "Live debate"} {"\u00B7"}{" "}
          {debate.argumentCount.toLocaleString()} arguments
          {remaining ? ` \u00B7 ${remaining}` : ""}
        </p>
      </div>
      <h3 className="font-display text-[18px] font-semibold leading-snug text-white">
        {debate.title}
      </h3>
      <div className="mt-3">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-700">
          <span className="h-full bg-emerald-brand" style={{ width: `${forPct}%` }} />
          <span className="h-full bg-purple-accent" style={{ width: `${againstPct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-medium">
          <span className="text-emerald-300">For - {forPct}%</span>
          <span className="text-purple-300">Against - {againstPct}%</span>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href={`/debates/${debate.id}`}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          Argue the motion
        </Link>
        <Link
          href={`/debates/${debate.id}`}
          className="rounded-lg border border-white/20 px-3.5 py-2 text-center text-[13px] font-semibold text-gray-300 transition-colors hover:border-white/40 hover:text-white"
        >
          Read all arguments
        </Link>
      </div>
    </section>
  );
}
