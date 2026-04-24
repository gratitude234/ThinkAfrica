import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { DebatePhase } from "@/lib/debatePhases";
import { formatRelativeTime } from "@/lib/utils";
import LiveArguments from "./LiveArguments";
import DebateRecap from "./DebateRecap";
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

function resolveStance(argument: { stance?: string | null; round_number: number }) {
  if (argument.stance === "for" || argument.stance === "against") {
    return argument.stance;
  }

  return argument.round_number % 2 === 1 ? "for" : "against";
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
    .select("*, profiles!debates_moderator_id_fkey(username, full_name, university)")
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

  let userParticipant: { stance: "for" | "against" } | null = null;
  if (user) {
    const { data: participantRow } = await supabase
      .from("debate_participants")
      .select("stance")
      .eq("debate_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (participantRow) {
      userParticipant = {
        stance: participantRow.stance as "for" | "against",
      };
    }
  }

  let userMotionVote: "for" | "against" | null = null;
  if (user) {
    const { data: motionVoteRow } = await supabase
      .from("debate_motion_votes")
      .select("vote")
      .eq("debate_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (motionVoteRow) {
      userMotionVote = motionVoteRow.vote as "for" | "against";
    }
  }

  const status = debate.status as DebateStatus;
  const currentPhase = (debate.current_phase ?? "opening") as DebatePhase;
  const moderator = Array.isArray(debate.profiles)
    ? debate.profiles[0]
    : debate.profiles;
  const isModeratorOfDebate = user?.id === debate.moderator_id;
  const forArguments = argumentsWithProfiles.filter(
    (argument) => resolveStance(argument) === "for"
  );
  const againstArguments = argumentsWithProfiles.filter(
    (argument) => resolveStance(argument) === "against"
  );
  const argumentCount = argumentsWithProfiles.length;

  return (
    <div>
      <div className="sticky top-16 z-40 -mx-4 border-b border-gray-200 bg-white px-6 py-4 sm:-mx-6 lg:-mx-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="min-w-0">
            <h1 className="font-display line-clamp-1 text-xl font-bold text-ink">
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
              <span>Started {formatRelativeTime(debate.created_at)}</span>
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
          debateTitle={debate.title}
          initialForArguments={forArguments}
          initialAgainstArguments={againstArguments}
          currentUserId={user?.id ?? null}
          userVotedIds={userVotedIds}
          debateStatus={status}
          userParticipant={userParticipant}
          motionForCount={debate.motion_for_count ?? 0}
          motionAgainstCount={debate.motion_against_count ?? 0}
          userMotionVote={userMotionVote}
          currentPhase={currentPhase}
          isModeratorOfDebate={isModeratorOfDebate}
        />

        {status === "closed" && debate.recap_text ? (
          <DebateRecap
            recapText={debate.recap_text}
            generatedAt={debate.recap_generated_at ?? debate.created_at}
            forVotes={debate.motion_for_count ?? 0}
            againstVotes={debate.motion_against_count ?? 0}
          />
        ) : status === "closed" ? (
          <div className="mt-10 rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
            Recap is being generated...
          </div>
        ) : null}
      </div>
    </div>
  );
}
