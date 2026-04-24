"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { type DebatePhase, PHASE_LABELS } from "@/lib/debatePhases";
import UpvoteButton from "./UpvoteButton";
import ArgumentForm from "./ArgumentForm";
import MotionVotePanel from "./MotionVotePanel";
import PhaseControls from "./PhaseControls";

interface ArgumentAuthor {
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

interface Argument {
  id: string;
  debate_id: string;
  author_id: string;
  content: string;
  round_number: number;
  upvotes: number;
  created_at: string;
  stance: "for" | "against" | null;
  profiles: ArgumentAuthor | null;
}

interface LiveArgumentsProps {
  debateId: string;
  debateTitle: string;
  initialForArguments: Argument[];
  initialAgainstArguments: Argument[];
  currentUserId: string | null;
  userVotedIds: string[];
  debateStatus: string;
  userParticipant: { stance: "for" | "against" } | null;
  motionForCount: number;
  motionAgainstCount: number;
  userMotionVote: "for" | "against" | null;
  currentPhase: DebatePhase;
  isModeratorOfDebate: boolean;
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getInitials(name: string | null | undefined) {
  const cleaned = name?.trim();

  if (!cleaned) return "?";

  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function resolveStance(argument: Pick<Argument, "stance" | "round_number">) {
  if (argument.stance === "for" || argument.stance === "against") {
    return argument.stance;
  }

  return argument.round_number % 2 === 1 ? "for" : "against";
}

function sortByUpvotes(argumentsList: Argument[]) {
  return [...argumentsList].sort((a, b) => b.upvotes - a.upvotes);
}

function upsertArgument(argumentsList: Argument[], argument: Argument) {
  if (argumentsList.some((item) => item.id === argument.id)) {
    return argumentsList;
  }

  return [...argumentsList, argument];
}

function updateVoteCount(argumentsList: Argument[], id: string, upvotes: number) {
  return argumentsList.map((argument) =>
    argument.id === id ? { ...argument, upvotes } : argument
  );
}

function EmptyColumn({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4 text-sm text-gray-400">
      {message}
    </div>
  );
}

function ArgumentCard({
  argument,
  hasVoted,
  currentUserId,
}: {
  argument: Argument;
  hasVoted: boolean;
  currentUserId: string | null;
}) {
  const author = argument.profiles;
  const authorName = author?.full_name ?? author?.username ?? "Unknown";
  const actualStance = resolveStance(argument);
  const borderClass =
    actualStance === "for"
      ? "border-l-4 border-emerald-500"
      : actualStance === "against"
        ? "border-l-4 border-red-400"
        : "border-l-4 border-gray-200";
  const badgeClass =
    actualStance === "for"
      ? "bg-emerald-100 text-emerald-700"
      : actualStance === "against"
        ? "bg-red-100 text-red-600"
        : "bg-gray-100 text-gray-500";
  const badgeLabel =
    actualStance === "for"
      ? "FOR"
      : actualStance === "against"
        ? "AGAINST"
        : "LEGACY";

  return (
    <div className={`mb-3 rounded-xl border border-gray-200 bg-white p-4 ${borderClass}`}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatar_url}
              alt={authorName}
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
              {getInitials(authorName)}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {author ? (
                <Link
                  href={`/${author.username}`}
                  className="text-sm font-semibold text-gray-900 transition-colors hover:text-emerald-brand"
                >
                  {authorName}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-gray-900">Unknown</span>
              )}
              <span className={`rounded px-1.5 text-[10px] font-bold ${badgeClass}`}>
                {badgeLabel}
              </span>
            </div>
            {author?.university ? (
              <p className="truncate text-xs text-gray-400">{author.university}</p>
            ) : null}
          </div>
        </div>

        <span className="flex-shrink-0 text-xs text-gray-400">
          {timeAgo(argument.created_at)}
        </span>
      </div>

      <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-gray-700">
        {argument.content}
      </p>

      <UpvoteButton
        argumentId={argument.id}
        initialCount={argument.upvotes}
        initialVoted={hasVoted}
        disabled={!currentUserId}
      />
    </div>
  );
}

export default function LiveArguments({
  debateId,
  debateTitle,
  initialForArguments,
  initialAgainstArguments,
  currentUserId,
  userVotedIds,
  debateStatus,
  userParticipant,
  motionForCount,
  motionAgainstCount,
  userMotionVote,
  currentPhase,
  isModeratorOfDebate,
}: LiveArgumentsProps) {
  const [forArguments, setForArguments] = useState<Argument[]>(initialForArguments);
  const [againstArguments, setAgainstArguments] = useState<Argument[]>(
    initialAgainstArguments
  );
  const [votedIds] = useState<Set<string>>(new Set(userVotedIds));

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`debate-args:${debateId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "debate_arguments",
          filter: `debate_id=eq.${debateId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("debate_arguments")
            .select(
              "*, profiles!debate_arguments_author_id_fkey(username, full_name, university, avatar_url)"
            )
            .eq("id", payload.new.id)
            .single();

          if (!data) return;

          const argument = {
            ...data,
            profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles,
          } as Argument;

          if (resolveStance(argument) === "for") {
            setForArguments((prev) => upsertArgument(prev, argument));
          } else {
            setAgainstArguments((prev) => upsertArgument(prev, argument));
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "debate_arguments",
          filter: `debate_id=eq.${debateId}`,
        },
        (payload) => {
          const newId = payload.new.id as string;
          const newUpvotes = payload.new.upvotes as number;

          setForArguments((prev) => updateVoteCount(prev, newId, newUpvotes));
          setAgainstArguments((prev) => updateVoteCount(prev, newId, newUpvotes));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [debateId]);

  const sortedForArguments = sortByUpvotes(forArguments);
  const sortedAgainstArguments = sortByUpvotes(againstArguments);
  const forPoints = sortedForArguments.reduce(
    (sum, argument) => sum + argument.upvotes,
    0
  );
  const againstPoints = sortedAgainstArguments.reduce(
    (sum, argument) => sum + argument.upvotes,
    0
  );
  const totalPoints = forPoints + againstPoints;
  const forWidth = totalPoints === 0 ? 50 : (forPoints / totalPoints) * 100;
  const againstWidth = totalPoints === 0 ? 50 : (againstPoints / totalPoints) * 100;
  const isClosed = debateStatus === "closed";

  return (
    <div>
      <div className="mb-4 text-sm text-gray-500">
        For: {sortedForArguments.length} - Against: {sortedAgainstArguments.length}
      </div>

      <div className="mb-4 text-center">
        <span className="rounded-full bg-gray-100 px-4 py-1.5 text-sm font-semibold text-gray-600">
          Phase: {PHASE_LABELS[currentPhase]}
        </span>
      </div>

      {isModeratorOfDebate ? (
        <div className="mb-4">
          <PhaseControls
            debateId={debateId}
            currentPhase={currentPhase}
            debateStatus={debateStatus}
          />
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold uppercase tracking-wide text-emerald-700">
            FOR
          </div>

          {sortedForArguments.length === 0 ? (
            <EmptyColumn message="No FOR arguments yet." />
          ) : (
            sortedForArguments.map((argument) => (
              <ArgumentCard
                key={argument.id}
                argument={argument}
                hasVoted={votedIds.has(argument.id)}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>

        <div>
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm font-bold uppercase tracking-wide text-red-700">
            AGAINST
          </div>

          {sortedAgainstArguments.length === 0 ? (
            <EmptyColumn message="No AGAINST arguments yet." />
          ) : (
            sortedAgainstArguments.map((argument) => (
              <ArgumentCard
                key={argument.id}
                argument={argument}
                hasVoted={votedIds.has(argument.id)}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          Argument quality score
        </p>
        <div className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-700">
          <span>FOR</span>
          <span>AGAINST</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="bg-emerald-400 transition-all duration-300"
            style={{ width: `${forWidth}%` }}
          />
          <div
            className="bg-red-400 transition-all duration-300"
            style={{ width: `${againstWidth}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <span>{forPoints} pts</span>
          <span>{againstPoints} pts</span>
        </div>
      </div>

      <MotionVotePanel
        debateId={debateId}
        initialForCount={motionForCount}
        initialAgainstCount={motionAgainstCount}
        initialUserVote={userMotionVote}
        isClosed={isClosed}
        currentUserId={currentUserId}
        motionTitle={debateTitle}
      />

      <div className="mt-8 border-t border-gray-200 pt-6">
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          {isClosed ? "Debate Closed" : "Submit Your Argument"}
        </h3>
        {!currentUserId && !isClosed ? (
          <div className="rounded-xl border border-gray-200 bg-canvas p-4 text-center text-sm text-gray-500">
            <Link
              href="/login"
              className="font-medium text-emerald-600 hover:underline"
            >
              Sign in
            </Link>{" "}
            to participate in this debate.
          </div>
        ) : (
          <ArgumentForm
            debateId={debateId}
            disabled={isClosed}
            userParticipant={userParticipant}
            currentPhase={currentPhase}
          />
        )}
      </div>
    </div>
  );
}
