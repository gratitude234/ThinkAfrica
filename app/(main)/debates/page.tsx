import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export const revalidate = 30;

type DebateStatus = "open" | "active" | "closed";

const STATUS_STYLES: Record<DebateStatus, string> = {
  open: "bg-emerald-100 text-emerald-700",
  active: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};

function timeRemaining(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (diffMs <= 0) return "Ended";
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) return `${Math.floor(hours / 24)}d remaining`;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function DebatesPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("debates")
    .select("*, debate_arguments(count)")
    .order("created_at", { ascending: false });

  if (statusParam && ["open", "active", "closed"].includes(statusParam)) {
    query = query.eq("status", statusParam);
  }

  const { data: debates } = await query;

  const tabs = [
    { label: "All", value: "" },
    { label: "Open", value: "open" },
    { label: "Active", value: "active" },
    { label: "Closed", value: "closed" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debates</h1>
          <p className="text-gray-500 text-sm mt-1">
            Structured intellectual discussions from African students
          </p>
        </div>
        {user && (
          <Link
            href="/debates/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Start a Debate
          </Link>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((tab) => {
          const href = tab.value ? `/debates?status=${tab.value}` : "/debates";
          const active = (statusParam ?? "") === tab.value;
          return (
            <Link
              key={tab.value}
              href={href}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                active
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Debate cards */}
      {!debates || debates.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-1">No debates yet</p>
          <p className="text-sm">
            {user
              ? "Be the first to start one!"
              : "Sign in to start a debate."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {debates.map((debate) => {
            const status = debate.status as DebateStatus;
            const argCount = Array.isArray(debate.debate_arguments)
              ? (debate.debate_arguments[0] as unknown as { count: number })
                  ?.count ?? 0
              : 0;
            const remaining = timeRemaining(debate.ends_at);

            return (
              <Link
                key={debate.id}
                href={`/debates/${debate.id}`}
                className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}
                      >
                        {status}
                      </span>
                      {remaining && status === "active" && (
                        <span className="text-xs text-amber-600 font-medium">
                          ⏱ {remaining}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 leading-snug mb-2 hover:text-emerald-brand transition-colors">
                      {debate.title}
                    </h2>
                    {debate.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                        {debate.description}
                      </p>
                    )}
                    {debate.tags && debate.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {debate.tags.slice(0, 5).map((tag: string) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    {argCount} {argCount === 1 ? "argument" : "arguments"}
                  </span>
                  <span>{formatDate(debate.created_at)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
