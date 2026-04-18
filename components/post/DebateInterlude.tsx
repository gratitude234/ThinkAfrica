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
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
        Debate in progress
      </p>
      <h3 className="mt-2 text-lg font-semibold text-gray-900">
        {debate.title}
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        {debate.argumentCount}{" "}
        {debate.argumentCount === 1 ? "argument" : "arguments"} so far.
      </p>
      <Link
        href={`/debates/${debate.id}`}
        className="mt-3 inline-block text-sm font-medium text-emerald-brand hover:underline"
      >
        Join the debate →
      </Link>
    </div>
  );
}
