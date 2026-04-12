import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import LiveArguments from "./LiveArguments";
import DebateCountdown from "./DebateCountdown";

type DebateStatus = "open" | "active" | "closed";

const STATUS_STYLES: Record<DebateStatus, string> = {
  open: "bg-emerald-100 text-emerald-700",
  active: "bg-amber-100 text-amber-700",
  closed: "bg-gray-100 text-gray-500",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function isForArgument(roundNumber: number) {
  // TODO: add 'side' column to debate_arguments table for proper splitting
  return roundNumber % 2 === 1;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: debate } = await supabase
    .from("debates")
    .select("title, description")
    .eq("id", id)
    .single();

  if (!debate) return { title: "Debate not found - ThinkAfrica" };

  return {
    title: `${debate.title} - ThinkAfrica Debates`,
    description:
      (debate as { description?: string | null }).description ??
      "Join this debate on ThinkAfrica",
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

  const { data: debate } = await supabase
    .from("debates")
    .select(
      "*, profiles!debates_moderator_id_fkey(username, full_name, university)"
    )
    .eq("id", id)
    .single();

  if (!debate) notFound();

  const { data: rawArgs } = await supabase
    .from("debate_arguments")
    .select(
      "*, profiles!debate_arguments_author_id_fkey(username, full_name, university, avatar_url)"
    )
    .eq("debate_id", id)
    .order("created_at", { ascending: true });

  const argumentsWithProfiles = (rawArgs ?? []).map((argument) => ({
    ...argument,
    profiles: Array.isArray(argument.profiles)
      ? argument.profiles[0]
      : argument.profiles,
  }));

  let userVotedIds: string[] = [];
  if (user && argumentsWithProfiles.length > 0) {
    const argumentIds = argumentsWithProfiles.map((argument) => argument.id);
    const { data: votes } = await supabase
      .from("debate_votes")
      .select("argument_id")
      .eq("user_id", user.id)
      .in("argument_id", argumentIds);
    userVotedIds = (votes ?? []).map((vote) => vote.argument_id);
  }

  const status = debate.status as DebateStatus;
  const moderator = Array.isArray(debate.profiles)
    ? debate.profiles[0]
    : debate.profiles;
  const currentRound =
    argumentsWithProfiles.length > 0
      ? Math.max(...argumentsWithProfiles.map((argument) => argument.round_number))
      : 1;
  const forArguments = argumentsWithProfiles.filter((argument) =>
    isForArgument(argument.round_number)
  );
  const againstArguments = argumentsWithProfiles.filter(
    (argument) => !isForArgument(argument.round_number)
  );
  const argumentCount = argumentsWithProfiles.length;

  return (
    <div>
      <div className="sticky top-16 z-40 -mx-4 border-b border-gray-200 bg-white px-6 py-4 sm:-mx-6 lg:-mx-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="min-w-0">
            <h1 className="line-clamp-1 text-xl font-bold text-gray-900">
              {debate.title}
            </h1>
          </div>

          <div className="flex items-center justify-start gap-3 md:justify-center">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status]}`}
            >
              {status}
            </span>
            <span className="text-sm text-gray-500">
              {argumentCount} {argumentCount === 1 ? "argument" : "arguments"}
            </span>
          </div>

          <div className="flex justify-start md:justify-end">
            {debate.ends_at && status !== "closed" ? (
              <DebateCountdown endsAt={debate.ends_at} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl py-8">
        {(debate.description || (debate.tags && debate.tags.length > 0) || moderator) && (
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
            {debate.description ? (
              <p className="text-sm leading-relaxed text-gray-600">
                {debate.description}
              </p>
            ) : null}

            {debate.tags && debate.tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {debate.tags.map((tag: string) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 text-xs text-gray-400">
              <span>Started {formatDate(debate.created_at)}</span>
              {debate.round_duration_minutes ? (
                <span>{debate.round_duration_minutes} min rounds</span>
              ) : null}
              {moderator ? (
                <span>
                  Moderated by{" "}
                  <span className="font-medium text-gray-600">
                    {moderator.full_name ?? moderator.username}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        )}

        <LiveArguments
          debateId={id}
          initialForArguments={forArguments}
          initialAgainstArguments={againstArguments}
          currentUserId={user?.id ?? null}
          userVotedIds={userVotedIds}
          debateStatus={status}
          currentRound={currentRound}
        />
      </div>
    </div>
  );
}
