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

  /* Was a `bg-gray-900` slab bleeding edge-to-edge on phones. Two problems,
     both surfaced by the flat feed. It ran raw Tailwind greys, so it was a
     fourth palette next to the brand tokens everything else uses. And it was
     the third dark block in the column, after the emerald Editor's Pick hero
     and the gradient article covers -- tolerable when cards broke them up,
     heavy once nothing else on the page had an edge. It reads as an
     interruption now the same way the other interludes do: by being boxed and
     inset in a feed that is neither. The live signal survives in the pulse dot
     and the for/against bar, which is where it was doing work. */
  return (
    <section className="my-5 grid gap-3 rounded-2xl border border-card-border bg-card p-4 sm:my-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-emerald-ink" />
          <p className="text-kicker font-bold uppercase text-emerald-ink">
            {status === "open" ? "Open debate" : "Live debate"} {"\u00B7"}{" "}
            {debate.argumentCount.toLocaleString()} arguments
            {remaining ? ` \u00B7 ${remaining}` : ""}
          </p>
        </div>
        <h3 className="font-display line-clamp-3 text-lede font-semibold leading-snug text-ink">
          {debate.title}
        </h3>
        <div className="mt-3">
          {/* Both halves are `ink` accents rather than the brand fills. The
              fills diverge across themes -- emerald-brand darkens while
              purple-accent lightens -- so in dark mode the bar was a heavy
              green against a pale lilac. The ink pair moves together. */}
          <div className="flex h-1.5 overflow-hidden rounded-full bg-divider">
            <span className="h-full bg-emerald-ink" style={{ width: `${forPct}%` }} />
            <span className="h-full bg-purple-accent" style={{ width: `${againstPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-meta font-medium">
            <span className="text-emerald-ink">For {"\u00B7"} {forPct}%</span>
            <span className="text-purple-accent">Against {"\u00B7"} {againstPct}%</span>
          </div>
        </div>
      </div>
      <Link
        href={`/debates/${debate.id}`}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#0E4B37] sm:whitespace-nowrap"
      >
        Join debate →
      </Link>
    </section>
  );
}
