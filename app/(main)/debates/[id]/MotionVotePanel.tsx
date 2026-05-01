"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { StanceMeter, getVoteSplit } from "../DebatePrimitives";

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

  const split = getVoteSplit(forCount, againstCount);

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
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">
        {isClosed ? "Final community verdict" : "Vote on the motion"}
      </p>
      <p className="mb-4 text-sm font-semibold leading-6 text-gray-800">
        {motionTitle}
      </p>

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
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {userVote === "against" ? "Voted AGAINST" : "Vote AGAINST"}
          </button>
        </div>
      ) : null}

      {!isClosed && !currentUserId ? (
        <p className="mb-4 rounded-xl border border-gray-200 bg-canvas p-4 text-sm text-gray-500">
          <Link href="/login" className="font-medium text-emerald-600 hover:underline">
            Sign in
          </Link>{" "}
          to vote on the motion.
        </p>
      ) : null}

      <div className="rounded-xl border border-gray-100 bg-canvas p-3">
        <StanceMeter
          forCount={forCount}
          againstCount={againstCount}
          label={isClosed ? "Final vote" : "Current vote"}
          compact
        />
        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>{forCount} for</span>
          <span>{split.total} votes</span>
          <span>{againstCount} against</span>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      ) : null}

      {isClosed && split.total > 0 ? (
        <div
          className={`mt-4 rounded-xl px-4 py-3 text-center text-sm font-bold ${
            forCount > againstCount
              ? "bg-emerald-50 text-emerald-800"
              : againstCount > forCount
                ? "bg-amber-50 text-amber-800"
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
