"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import UpvoteButton from "./UpvoteButton";
import ArgumentForm from "./ArgumentForm";

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
  profiles: ArgumentAuthor | null;
}

interface LiveArgumentsProps {
  debateId: string;
  initialArguments: Argument[];
  currentUserId: string | null;
  userVotedIds: string[];
  debateStatus: string;
  currentRound: number;
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

export default function LiveArguments({
  debateId,
  initialArguments,
  currentUserId,
  userVotedIds,
  debateStatus,
  currentRound,
}: LiveArgumentsProps) {
  const [args, setArgs] = useState<Argument[]>(initialArguments);
  const [votedIds, setVotedIds] = useState<Set<string>>(
    new Set(userVotedIds)
  );

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
          // Fetch full argument with author profile
          const { data } = await supabase
            .from("debate_arguments")
            .select(
              "*, profiles!debate_arguments_author_id_fkey(username, full_name, university, avatar_url)"
            )
            .eq("id", payload.new.id)
            .single();

          if (data) {
            const arg = {
              ...data,
              profiles: Array.isArray(data.profiles)
                ? data.profiles[0]
                : data.profiles,
            };
            setArgs((prev) => {
              if (prev.some((a) => a.id === arg.id)) return prev;
              return [...prev, arg];
            });
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
          setArgs((prev) =>
            prev.map((a) =>
              a.id === payload.new.id
                ? { ...a, upvotes: payload.new.upvotes }
                : a
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [debateId]);

  // Group arguments by round
  const rounds = args.reduce(
    (acc, arg) => {
      const r = arg.round_number;
      if (!acc[r]) acc[r] = [];
      acc[r].push(arg);
      return acc;
    },
    {} as Record<number, Argument[]>
  );

  const roundNumbers = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  const isClosed = debateStatus === "closed";

  return (
    <div className="space-y-8">
      {/* Arguments grouped by round */}
      {args.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-base font-medium mb-1">No arguments yet</p>
          <p className="text-sm">Be the first to submit an argument below.</p>
        </div>
      ) : (
        roundNumbers.map((round) => (
          <div key={round}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Round {round}
            </h3>
            <div className="space-y-4">
              {rounds[round]
                .sort((a, b) => b.upvotes - a.upvotes)
                .map((arg) => {
                  const author = arg.profiles;
                  const hasVoted = votedIds.has(arg.id);
                  return (
                    <div
                      key={arg.id}
                      className="bg-white border border-gray-200 rounded-xl p-5"
                    >
                      {/* Author */}
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold flex-shrink-0">
                            {author?.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                          </div>
                          <div>
                            {author ? (
                              <Link
                                href={`/${author.username}`}
                                className="text-sm font-semibold text-gray-900 hover:text-emerald-brand transition-colors"
                              >
                                {author.full_name ?? author.username}
                              </Link>
                            ) : (
                              <span className="text-sm font-semibold text-gray-900">
                                Unknown
                              </span>
                            )}
                            {author?.university && (
                              <p className="text-xs text-gray-400">
                                {author.university}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {timeAgo(arg.created_at)}
                        </span>
                      </div>

                      {/* Content */}
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-3">
                        {arg.content}
                      </p>

                      {/* Upvote */}
                      <UpvoteButton
                        argumentId={arg.id}
                        initialCount={arg.upvotes}
                        initialVoted={hasVoted}
                        disabled={!currentUserId}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        ))
      )}

      {/* Submit argument */}
      <div className="pt-4 border-t border-gray-200">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          {isClosed ? "Debate Closed" : "Submit Your Argument"}
        </h3>
        {!currentUserId && !isClosed ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
            <Link href="/login" className="text-emerald-600 font-medium hover:underline">
              Sign in
            </Link>{" "}
            to participate in this debate.
          </div>
        ) : (
          <ArgumentForm
            debateId={debateId}
            roundNumber={currentRound}
            disabled={isClosed}
          />
        )}
      </div>
    </div>
  );
}
