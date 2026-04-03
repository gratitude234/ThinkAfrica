"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface UpvoteButtonProps {
  argumentId: string;
  initialCount: number;
  initialVoted: boolean;
  disabled?: boolean;
}

export default function UpvoteButton({
  argumentId,
  initialCount,
  initialVoted,
  disabled,
}: UpvoteButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [voted, setVoted] = useState(initialVoted);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (disabled || loading) return;
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("toggle_debate_vote", {
      p_argument_id: argumentId,
    });

    if (!error && data) {
      const wasVoted = (data as { voted: boolean }).voted;
      setVoted(wasVoted);
      setCount((prev) => (wasVoted ? prev + 1 : Math.max(prev - 1, 0)));
    }

    setLoading(false);
  }

  return (
    <button
      onClick={handleToggle}
      disabled={disabled || loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        voted
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title={disabled ? "Sign in to vote" : voted ? "Remove vote" : "Upvote"}
    >
      <svg
        className="w-4 h-4"
        fill={voted ? "currentColor" : "none"}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 15l7-7 7 7"
        />
      </svg>
      {count}
    </button>
  );
}
