import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Pill from "@/components/ui/Pill";
import { formatDate } from "@/lib/utils";

export const revalidate = 30;

type DebateStatus = "open" | "active" | "closed";

const STATUS_VARIANTS: Record<DebateStatus, "emerald" | "amber" | "gray"> = {
  open: "emerald",
  active: "amber",
  closed: "gray",
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Debates</h1>
          <p className="mt-1 text-sm text-gray-500">
            Structured intellectual discussions from African students
          </p>
        </div>
        {user ? (
          <Link
            href="/debates/create"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
          >
            <svg
              className="h-4 w-4"
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
        ) : null}
      </div>

      <div className="mb-6 flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((tab) => {
          const href = tab.value ? `/debates?status=${tab.value}` : "/debates";
          const active = (statusParam ?? "") === tab.value;
          return (
            <Link
              key={tab.value}
              href={href}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
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

      {!debates || debates.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <p className="mb-1 text-lg font-medium">No debates yet</p>
          <p className="text-sm">
            {user ? "Be the first to start one!" : "Sign in to start a debate."}
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
                className="block rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-2">
                      <Pill variant={STATUS_VARIANTS[status]} className="capitalize">
                        {status}
                      </Pill>
                      {remaining && status === "active" ? (
                        <span className="text-xs font-medium text-amber-600">
                          {remaining}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mb-2 text-lg font-semibold leading-snug text-gray-900 transition-colors hover:text-emerald-brand">
                      {debate.title}
                    </h2>
                    {debate.description ? (
                      <p className="mb-3 line-clamp-2 text-sm text-gray-500">
                        {debate.description}
                      </p>
                    ) : null}
                    {debate.tags && debate.tags.length > 0 ? (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {debate.tags.slice(0, 5).map((tag: string) => (
                          <Pill key={tag} variant="neutral">
                            {tag}
                          </Pill>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <svg
                      className="h-3.5 w-3.5"
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
