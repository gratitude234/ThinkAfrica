import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import LiveArguments from "./LiveArguments";

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
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: debate } = await supabase
    .from("debates")
    .select("title, description")
    .eq("id", id)
    .single();

  if (!debate) return { title: "Debate not found — ThinkAfrica" };

  return {
    title: `${debate.title} — ThinkAfrica Debates`,
    description: (debate as { description?: string | null }).description ?? `Join this debate on ThinkAfrica`,
    openGraph: {
      title: debate.title,
      description: (debate as { description?: string | null }).description ?? "",
      siteName: "ThinkAfrica",
    },
  };
}

export default async function DebatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch debate
  const { data: debate } = await supabase
    .from("debates")
    .select(
      "*, profiles!debates_moderator_id_fkey(username, full_name, university)"
    )
    .eq("id", id)
    .single();

  if (!debate) notFound();

  // Fetch all arguments with author profiles
  const { data: rawArgs } = await supabase
    .from("debate_arguments")
    .select(
      "*, profiles!debate_arguments_author_id_fkey(username, full_name, university, avatar_url)"
    )
    .eq("debate_id", id)
    .order("created_at", { ascending: true });

  const args = (rawArgs ?? []).map((a) => ({
    ...a,
    profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
  }));

  // Fetch current user's votes on these arguments
  let userVotedIds: string[] = [];
  if (user && args.length > 0) {
    const argIds = args.map((a) => a.id);
    const { data: votes } = await supabase
      .from("debate_votes")
      .select("argument_id")
      .eq("user_id", user.id)
      .in("argument_id", argIds);
    userVotedIds = (votes ?? []).map((v) => v.argument_id);
  }

  const status = debate.status as DebateStatus;
  const remaining = timeRemaining(debate.ends_at);
  const moderator = Array.isArray(debate.profiles)
    ? debate.profiles[0]
    : debate.profiles;

  // Determine current round (max round in args, or 1)
  const currentRound =
    args.length > 0 ? Math.max(...args.map((a) => a.round_number)) : 1;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize flex-shrink-0 ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>
          {remaining && status === "active" && (
            <span className="text-xs text-amber-600 font-medium mt-0.5">
              ⏱ {remaining}
            </span>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {debate.title}
        </h1>

        {debate.description && (
          <p className="text-gray-600 text-sm leading-relaxed mb-4">
            {debate.description}
          </p>
        )}

        {debate.tags && debate.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {debate.tags.map((tag: string) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-gray-400 pt-4 border-t border-gray-100">
          <span>Started {formatDate(debate.created_at)}</span>
          {debate.round_duration_minutes && (
            <span>{debate.round_duration_minutes} min rounds</span>
          )}
          {moderator && (
            <span>
              Moderated by{" "}
              <span className="text-gray-600 font-medium">
                {moderator.full_name ?? moderator.username}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Arguments (live) */}
      <LiveArguments
        debateId={id}
        initialArguments={args}
        currentUserId={user?.id ?? null}
        userVotedIds={userVotedIds}
        debateStatus={status}
        currentRound={currentRound}
      />
    </div>
  );
}
