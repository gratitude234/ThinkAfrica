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
    <section className="my-3 grid gap-4 rounded-xl bg-gray-900 p-4 text-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300">
            {status === "open" ? "Open debate" : "Live debate"} {"\u00B7"}{" "}
            {debate.argumentCount.toLocaleString()} arguments
            {remaining ? ` \u00B7 ${remaining}` : ""}
          </p>
        </div>
        <h3 className="font-display text-[17px] font-semibold leading-snug text-white sm:text-[18px]">
          {debate.title}
        </h3>
        <div className="mt-3">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-700">
            <span className="h-full bg-emerald-brand" style={{ width: `${forPct}%` }} />
            <span className="h-full bg-purple-accent" style={{ width: `${againstPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-medium">
            <span className="text-emerald-300">For {"\u00B7"} {forPct}%</span>
            <span className="text-purple-300">Against {"\u00B7"} {againstPct}%</span>
          </div>
        </div>
      </div>
      <Link
        href={`/debates/${debate.id}`}
        className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-emerald-600 sm:whitespace-nowrap"
      >
        Join -&gt;
      </Link>
    </section>
  );
}
