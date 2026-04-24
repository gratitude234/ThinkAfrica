"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface MotionVotePanelProps {
  debateId: string;
  initialForCount: number;
  initialAgainstCount: number;
  initialUserVote: "for" | "against" | null;
  isClosed: boolean;
  currentUserId: string | null;
  motionTitle: string;
}

export default function MotionVotePanel({
  debateId,
  initialForCount,
  initialAgainstCount,
  initialUserVote,
  isClosed,
  currentUserId,
  motionTitle,
}: MotionVotePanelProps) {
  const [forCount, setForCount] = useState(initialForCount);
  const [againstCount, setAgainstCount] = useState(initialAgainstCount);
  const [userVote, setUserVote] = useState<"for" | "against" | null>(
    initialUserVote
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = forCount + againstCount;
  const forPct = total === 0 ? 50 : Math.round((forCount / total) * 100);
  const againstPct = 100 - forPct;

  const handleVote = async (vote: "for" | "against") => {
    if (!currentUserId || loading) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("cast_motion_vote", {
      p_debate_id: debateId,
      p_vote: vote,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else if (data) {
      const result = data as {
        user_vote: "for" | "against" | null;
        for_count: number;
        against_count: number;
      };

      setForCount(result.for_count);
      setAgainstCount(result.against_count);
      setUserVote(result.user_vote);
    }

    setLoading(false);
  };

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">
        {isClosed ? "Final community verdict" : "Vote on the motion"}
      </p>
      <p className="mb-4 text-sm font-semibold text-gray-800">{motionTitle}</p>

      {!isClosed && currentUserId ? (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void handleVote("for")}
            disabled={loading}
            className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              userVote === "for"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {userVote === "for" ? "Voted FOR" : "Vote FOR"}
          </button>
          <button
            type="button"
            onClick={() => void handleVote("against")}
            disabled={loading}
            className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50 ${
              userVote === "against"
                ? "border-red-500 bg-red-500 text-white"
                : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            {userVote === "against" ? "Voted AGAINST" : "Vote AGAINST"}
          </button>
        </div>
      ) : null}

      {!isClosed && !currentUserId ? (
        <p className="mb-4 text-sm text-gray-500">
          <Link href="/login" className="font-medium text-emerald-600 hover:underline">
            Sign in
          </Link>{" "}
          to vote on the motion.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-full bg-gray-100" style={{ height: "10px" }}>
        <div className="flex h-full">
          <div
            className="bg-emerald-400 transition-all duration-500"
            style={{ width: `${forPct}%` }}
          />
          <div
            className="bg-red-400 transition-all duration-500"
            style={{ width: `${againstPct}%` }}
          />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-semibold text-emerald-700">
          {forPct}% FOR <span className="font-normal text-gray-400">({forCount})</span>
        </span>
        <span className="text-xs text-gray-400">{total} votes</span>
        <span className="font-semibold text-red-700">
          <span className="font-normal text-gray-400">({againstCount})</span>{" "}
          {againstPct}% AGAINST
        </span>
      </div>

      {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}

      {isClosed && total > 0 ? (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-center text-sm font-bold ${
            forCount > againstCount
              ? "bg-emerald-50 text-emerald-800"
              : againstCount > forCount
                ? "bg-red-50 text-red-800"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {forCount > againstCount
            ? "Community voted: FOR the motion"
            : againstCount > forCount
              ? "Community voted: AGAINST the motion"
              : "Community verdict: Split"}
        </div>
      ) : null}
    </div>
  );
}
