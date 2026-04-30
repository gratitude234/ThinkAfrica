import Link from "next/link";

export interface DebateInterludeData {
  id: string;
  title: string;
  argumentCount: number;
}

export default function DebateInterlude({
  debate,
}: {
  debate: DebateInterludeData;
}) {
  return (
    <section className="my-2 rounded-xl bg-gray-900 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300">
          Live debate {"\u00B7"} {debate.argumentCount.toLocaleString()} arguments
        </p>
      </div>
      <h3 className="font-display text-[17px] font-semibold leading-snug text-white">
        {debate.title}
      </h3>
      <div className="mt-3">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-700">
          <span className="h-full bg-emerald-brand" style={{ width: "58%" }} />
          <span className="h-full bg-purple-accent" style={{ width: "42%" }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] font-medium">
          <span className="text-emerald-400">For - 58%</span>
          <span className="text-purple-300">Against - 42%</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/debates/${debate.id}`}
          className="rounded-lg bg-emerald-brand px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-emerald-600"
        >
          Argue the motion
        </Link>
        <Link
          href={`/debates/${debate.id}`}
          className="rounded-lg border border-gray-700 px-3.5 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:border-gray-600 hover:text-white"
        >
          Read all arguments
        </Link>
      </div>
    </section>
  );
}
