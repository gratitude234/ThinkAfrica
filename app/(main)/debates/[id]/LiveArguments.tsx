"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  type DebatePhase,
  PHASE_DESCRIPTIONS,
  PHASE_LABELS,
} from "@/lib/debatePhases";
import { PhaseStepper, StanceMeter } from "../DebatePrimitives";
import Toast from "@/components/ui/Toast";
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

function phaseForRound(roundNumber: number): DebatePhase {
  if (roundNumber === 2) return "rebuttal";
  if (roundNumber === 3) return "closing";
  return "opening";
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
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-5 text-sm leading-6 text-gray-500">
      {message}
    </div>
  );
}

function ArgumentCard({
  argument,
  hasVoted,
  currentUserId,
  isClosed,
}: {
  argument: Argument;
  hasVoted: boolean;
  currentUserId: string | null;
  isClosed: boolean;
}) {
  const author = argument.profiles;
  const authorName = author?.full_name ?? author?.username ?? "Unknown";
  const actualStance = resolveStance(argument);
  const argumentPhase = phaseForRound(argument.round_number);
  const borderClass =
    actualStance === "for"
      ? "border-l-4 border-l-emerald-500"
      : actualStance === "against"
        ? "border-l-4 border-l-amber-500"
        : "border-l-4 border-l-gray-200";
  const badgeClass =
    actualStance === "for"
      ? "bg-emerald-100 text-emerald-700"
      : actualStance === "against"
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-500";
  const badgeLabel =
    actualStance === "for"
      ? "FOR"
      : actualStance === "against"
        ? "AGAINST"
        : "LEGACY";

  return (
    <article
      className={`mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-gray-100/60 ${borderClass}`}
    >
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
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {author ? (
                <Link
                  href={`/${author.username}`}
                  className="truncate text-sm font-semibold text-gray-900 transition-colors hover:text-emerald-brand"
                >
                  {authorName}
                </Link>
              ) : (
                <span className="text-sm font-semibold text-gray-900">Unknown</span>
              )}
              <span className={`rounded px-1.5 text-[10px] font-bold ${badgeClass}`}>
                {badgeLabel}
              </span>
              <span className="rounded bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-500">
                {PHASE_LABELS[argumentPhase]}
              </span>
            </div>
            {author?.university ? (
              <p className="truncate text-xs text-gray-500">{author.university}</p>
            ) : null}
          </div>
        </div>

        <span className="flex-shrink-0 text-xs text-gray-500">
          {timeAgo(argument.created_at)}
        </span>
      </div>

      <p className="mb-3 whitespace-pre-line break-words text-[15px] leading-7 text-gray-700">
        {argument.content}
      </p>

      <div className="border-t border-gray-100 pt-3">
        <UpvoteButton
          argumentId={argument.id}
          initialCount={argument.upvotes}
          initialVoted={hasVoted}
          disabled={!currentUserId || isClosed}
        />
      </div>
    </article>
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
  const [localDebateStatus, setLocalDebateStatus] = useState(debateStatus);
  const [localCurrentPhase, setLocalCurrentPhase] =
    useState<DebatePhase>(currentPhase);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [visibleStance, setVisibleStance] = useState<"for" | "against">(
    userParticipant?.stance ?? "for"
  );

  useEffect(() => {
    setLocalDebateStatus(debateStatus);
  }, [debateStatus]);

  useEffect(() => {
    setLocalCurrentPhase(currentPhase);
  }, [currentPhase]);

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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "debates",
          filter: `id=eq.${debateId}`,
        },
        (payload) => {
          const nextStatus =
            typeof payload.new.status === "string" ? payload.new.status : null;
          const nextPhase =
            payload.new.current_phase === "opening" ||
            payload.new.current_phase === "rebuttal" ||
            payload.new.current_phase === "closing"
              ? payload.new.current_phase
              : null;

          if (nextStatus) {
            setLocalDebateStatus((previousStatus) => {
              if (nextStatus !== previousStatus) {
                if (previousStatus === "open" && nextStatus === "active") {
                  setToastMessage("Debate is live. Submit your opening argument.");
                }
                if (previousStatus === "active" && nextStatus === "closed") {
                  setToastMessage(
                    "This debate has closed. Read the final verdict and recap."
                  );
                }
              }

              return nextStatus;
            });
          }

          if (nextPhase) {
            setLocalCurrentPhase(nextPhase);
          }
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
  const isClosed = localDebateStatus === "closed";
  const isOpen = localDebateStatus === "open";
  const canSubmitArguments = localDebateStatus === "active";

  return (
    <div>
      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
              Room status
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {isOpen
                ? "Open for participants"
                : isClosed
                  ? "Debate closed"
                  : PHASE_LABELS[localCurrentPhase]}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {isOpen
                ? "Choose a side and vote on the motion before the moderator starts rounds."
                : isClosed
                  ? "Voting and argument submission are closed. Read the strongest arguments below."
                  : PHASE_DESCRIPTIONS[localCurrentPhase]}
            </p>
          </div>

          <PhaseStepper
            currentPhase={localCurrentPhase}
            status={localDebateStatus}
          />
        </div>
      </div>

      {isModeratorOfDebate ? (
        <div className="mb-5">
          <PhaseControls
            debateId={debateId}
            currentPhase={localCurrentPhase}
            debateStatus={localDebateStatus}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Arguments
              </p>
              <p className="mt-1 text-sm text-gray-500">
                For: {sortedForArguments.length} - Against:{" "}
                {sortedAgainstArguments.length}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
              Ranked by upvotes
            </span>
          </div>

          <div className="mb-4 grid grid-cols-2 rounded-xl border border-gray-200 bg-white p-1 md:hidden">
            <button
              type="button"
              onClick={() => setVisibleStance("for")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                visibleStance === "for"
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-gray-500"
              }`}
            >
              FOR ({sortedForArguments.length})
            </button>
            <button
              type="button"
              onClick={() => setVisibleStance("against")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                visibleStance === "against"
                  ? "bg-amber-50 text-amber-700"
                  : "text-gray-500"
              }`}
            >
              AGAINST ({sortedAgainstArguments.length})
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className={visibleStance === "for" ? "block" : "hidden md:block"}>
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-bold uppercase tracking-wide text-emerald-700">
                FOR - {sortedForArguments.length}
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
                    isClosed={isClosed}
                  />
                ))
              )}
            </div>

            <div
              className={
                visibleStance === "against" ? "block" : "hidden md:block"
              }
            >
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm font-bold uppercase tracking-wide text-amber-700">
                AGAINST - {sortedAgainstArguments.length}
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
                    isClosed={isClosed}
                  />
                ))
              )}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
            <StanceMeter
              forCount={forPoints}
              againstCount={againstPoints}
              label="Argument quality score"
            />
            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
              <span>{forPoints} pts</span>
              <span>{againstPoints} pts</span>
            </div>
          </div>
        </div>

        <div
          id="participate"
          className="order-first space-y-5 lg:sticky lg:top-[84px] lg:order-none lg:self-start"
        >
          <MotionVotePanel
            debateId={debateId}
            initialForCount={motionForCount}
            initialAgainstCount={motionAgainstCount}
            initialUserVote={userMotionVote}
            isClosed={isClosed}
            currentUserId={currentUserId}
            motionTitle={debateTitle}
          />

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
              {isClosed ? "Debate closed" : "Join the room"}
            </p>
            <h3 className="mt-1 text-base font-semibold text-gray-900">
              {isOpen
                ? "Choose a side before start"
                : isClosed
                  ? "No new arguments"
                  : `Write for ${PHASE_LABELS[localCurrentPhase]}`}
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {isOpen
                ? "Vote now and lock your side. Argument submission opens when the moderator starts rounds."
                : isClosed
                  ? "The room is archived. Vote totals and strongest arguments remain visible."
                  : PHASE_DESCRIPTIONS[localCurrentPhase]}
            </p>

            <div className="mt-4">
              {!currentUserId && !isClosed ? (
                <div className="rounded-xl border border-gray-200 bg-canvas p-4 text-center text-sm text-gray-500">
                  <Link
                    href={`/login?redirectTo=/debates/${debateId}`}
                    className="font-medium text-emerald-600 hover:underline"
                  >
                    Sign in
                  </Link>{" "}
                  to vote, choose a side, or submit an argument.
                </div>
              ) : !isClosed ? (
                <ArgumentForm
                  debateId={debateId}
                  disabled={false}
                  submissionDisabled={!canSubmitArguments}
                  userParticipant={userParticipant}
                  currentPhase={localCurrentPhase}
                />
              ) : (
                <div className="rounded-xl border border-gray-200 bg-canvas p-4 text-sm text-gray-500">
                  {isClosed
                    ? "This debate is closed."
                    : "Argument submission is not open yet."}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </div>
  );
}
