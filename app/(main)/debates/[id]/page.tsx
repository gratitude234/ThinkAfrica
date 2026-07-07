import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { type DebatePhase } from "@/lib/debatePhases";
import { formatDate, formatRelativeTime, formatTimeUntil } from "@/lib/utils";
import {
  DebateStatusPill,
  PhasePill,
  StanceMeter,
  StatTile,
  getVoteSplit,
  type DebateStatus,
} from "../DebatePrimitives";
import LiveArguments from "./LiveArguments";
import DebateRecap from "./DebateRecap";
import DebateCountdown from "./DebateCountdown";
import ShareButton from "./ShareButton";
import RecapPoller from "./RecapPoller";

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

  if (!debate) return { title: "Debate not found - Indegenius" };

  return {
    title: `${debate.title} - Indegenius Debates`,
    description:
      (debate as { description?: string | null }).description ??
      "Join this debate on Indegenius",
    openGraph: {
      title: debate.title,
      description: (debate as { description?: string | null }).description ?? "",
      siteName: "Indegenius",
    },
  };
}

export default async function DebatePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: currentProfile } = user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

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

  const { data: participantCounts } = await supabase
    .from("debate_participants")
    .select("stance")
    .eq("debate_id", id);

  const forParticipants = (participantCounts ?? []).filter((p) => p.stance === "for").length;
  const againstParticipants = (participantCounts ?? []).filter((p) => p.stance === "against").length;

  const status = debate.status as DebateStatus;
  const isLive = status === "active";
  const currentPhase = (debate.current_phase ?? "opening") as DebatePhase;
  const moderator = Array.isArray(debate.profiles)
    ? debate.profiles[0]
    : debate.profiles;
  const isModeratorOfDebate =
    user?.id === debate.moderator_id ||
    currentProfile?.role === "editor" ||
    currentProfile?.role === "admin";
  const forArguments = argumentsWithProfiles.filter(
    (argument) => resolveStance(argument) === "for"
  );
  const againstArguments = argumentsWithProfiles.filter(
    (argument) => resolveStance(argument) === "against"
  );
  const argumentCount = argumentsWithProfiles.length;
  const forVotes = debate.motion_for_count ?? 0;
  const againstVotes = debate.motion_against_count ?? 0;
  const voteSplit = getVoteSplit(forVotes, againstVotes);
  const timeLabel =
    status === "active"
      ? formatTimeUntil(debate.ends_at)
      : status === "open"
        ? `Opened ${formatRelativeTime(debate.created_at)}`
        : `Closed ${formatDate(debate.ends_at ?? debate.created_at)}`;

  return (
    <div>
      <div className="sticky top-16 z-40 -mx-4 border-b border-gray-200 bg-white/95 px-6 py-3 backdrop-blur-xl sm:-mx-6 lg:-mx-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <Link
              href="/debates"
              className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand hover:underline"
            >
              Debates
            </Link>
            <h1 className="font-display line-clamp-1 text-lg font-bold text-ink">
              {debate.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DebateStatusPill status={status} />
            <span className="text-xs font-medium text-gray-500">
              {argumentCount} {argumentCount === 1 ? "argument" : "arguments"}
            </span>
            {debate.ends_at && status === "active" ? (
              <DebateCountdown endsAt={debate.ends_at} />
            ) : timeLabel ? (
              <span className="text-xs font-medium text-gray-400">{timeLabel}</span>
            ) : null}
            <ShareButton />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl py-8">
        <section
          className="mb-6 overflow-hidden rounded-2xl"
          style={
            isLive
              ? { background: "#111827" }
              : { border: "1px solid #E5E7EB", background: "white" }
          }
        >
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <DebateStatusPill status={status} />
                <PhasePill phase={currentPhase} />
                {isLive && debate.ends_at ? (
                  <DebateCountdown endsAt={debate.ends_at} />
                ) : timeLabel ? (
                  <span className="text-xs font-medium text-gray-400">{timeLabel}</span>
                ) : null}
              </div>
              <h2
                className="font-display text-3xl font-bold leading-tight"
                style={{ color: isLive ? "white" : undefined }}
              >
                {debate.title}
              </h2>
              {debate.description ? (
                <p
                  className="mt-3 max-w-3xl text-sm leading-6"
                  style={{ color: isLive ? "rgba(255,255,255,0.55)" : "#4B5563" }}
                >
                  {debate.description}
                </p>
              ) : null}

              {debate.tags && debate.tags.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {debate.tags.map((tag: string) => (
                    <span
                      key={tag}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${isLive ? "" : "bg-canvas text-gray-500"}`}
                      style={
                        isLive
                          ? { color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.07)" }
                          : undefined
                      }
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div
                className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-xs"
                style={
                  isLive
                    ? { borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }
                    : { borderColor: "#F3F4F6", color: "#9CA3AF" }
                }
              >
                <span>Opened {formatRelativeTime(debate.created_at)}</span>
                {debate.round_duration_minutes ? (
                  <span>{debate.round_duration_minutes} min phases</span>
                ) : null}
                {moderator ? (
                  <span>
                    Moderated by{" "}
                    <span
                      className="font-medium"
                      style={{ color: isLive ? "rgba(255,255,255,0.65)" : "#4B5563" }}
                    >
                      {moderator.full_name ?? moderator.username}
                    </span>
                  </span>
                ) : null}
                {status !== "closed" ? (
                  <a
                    href="#participate"
                    className="font-semibold text-emerald-brand hover:text-emerald-700"
                  >
                    Vote and argue
                  </a>
                ) : null}
              </div>
            </div>

            <aside
              className="p-5 lg:border-l"
              style={
                isLive
                  ? {
                      background: "rgba(255,255,255,0.04)",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      borderLeft: "1px solid rgba(255,255,255,0.08)",
                    }
                  : { borderTop: "1px solid #F3F4F6", background: "#FAF8F5" }
              }
            >
              <StanceMeter
                forCount={forVotes}
                againstCount={againstVotes}
                label={status === "closed" ? "Final verdict" : "Community vote"}
              />
              <p className="mt-2 text-xs" style={{ color: isLive ? "rgba(255,255,255,0.4)" : "#6B7280" }}>
                {voteSplit.total} community {voteSplit.total === 1 ? "vote" : "votes"}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-center">
                {[
                  { label: "arguments", value: argumentCount },
                  { label: "for / against", value: `${forArguments.length} / ${againstArguments.length}` },
                  { label: "participants", value: forParticipants + againstParticipants },
                  { label: "sides", value: `${forParticipants} / ${againstParticipants}` },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl px-3 py-3"
                    style={
                      isLive
                        ? { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }
                        : { border: "1px solid #F3F4F6", background: "white" }
                    }
                  >
                    <p
                      className="text-lg font-bold leading-none"
                      style={{ color: isLive ? "white" : undefined }}
                    >
                      {item.value}
                    </p>
                    <p
                      className="mt-1 text-[11px] font-medium"
                      style={{ color: isLive ? "rgba(255,255,255,0.4)" : "#6B7280" }}
                    >
                      {item.label}
                    </p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <LiveArguments
          debateId={id}
          debateTitle={debate.title}
          initialForArguments={forArguments}
          initialAgainstArguments={againstArguments}
          currentUserId={user?.id ?? null}
          userVotedIds={userVotedIds}
          debateStatus={status}
          userParticipant={userParticipant}
          motionForCount={forVotes}
          motionAgainstCount={againstVotes}
          userMotionVote={userMotionVote}
          currentPhase={currentPhase}
          isModeratorOfDebate={isModeratorOfDebate}
        />

        {status === "closed" && debate.recap_text ? (
          <DebateRecap
            recapText={debate.recap_text}
            generatedAt={debate.recap_generated_at ?? debate.created_at}
            forVotes={forVotes}
            againstVotes={againstVotes}
          />
        ) : status === "closed" ? (
          <div className="mt-10 rounded-2xl border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm font-medium text-gray-500">Recap is being generated…</p>
            <p className="mt-1 text-xs text-gray-400">This page will refresh automatically.</p>
            <RecapPoller />
          </div>
        ) : null}
      </div>
    </div>
  );
}
