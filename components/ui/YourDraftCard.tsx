import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";

export default function YourDraftCard({
  draft,
}: {
  draft: {
    id: string;
    title: string | null;
    updated_at: string;
  };
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Draft in progress
      </p>
      <h2 className="mt-2 text-base font-semibold text-gray-900">
        {draft.title?.trim() || "Untitled draft"}
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Last edited {formatRelativeTime(draft.updated_at)}
      </p>
      <Link
        href={`/write?draft=${draft.id}`}
        className="mt-3 inline-block text-sm font-medium text-emerald-brand hover:underline"
      >
        Continue writing →
      </Link>
    </div>
  );
}
