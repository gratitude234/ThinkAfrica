"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  type DebatePhase,
  PHASE_DESCRIPTIONS,
  PHASE_LABELS,
  PHASE_ROUND_MAP,
  PHASE_WORD_LIMITS,
} from "@/lib/debatePhases";

interface ArgumentFormProps {
  debateId: string;
  disabled?: boolean;
  submissionDisabled?: boolean;
  userParticipant: { stance: "for" | "against" } | null;
  currentPhase: DebatePhase;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function ArgumentForm({
  debateId,
  disabled,
  submissionDisabled,
  userParticipant,
  currentPhase,
}: ArgumentFormProps) {
  const [content, setContent] = useState("");
  const [joining, setJoining] = useState(false);
  const [joiningStance, setJoiningStance] = useState<"for" | "against" | null>(
    null
  );
  const [lockedStance, setLockedStance] = useState<"for" | "against" | null>(
    userParticipant?.stance ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const maxWords = PHASE_WORD_LIMITS[currentPhase];
  const roundNumber = PHASE_ROUND_MAP[currentPhase];
  const wordCount = countWords(content);
  const isOverLimit = wordCount > maxWords;

  const handleJoin = async (stance: "for" | "against") => {
    setJoining(true);
    setJoiningStance(stance);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("join_debate", {
      p_debate_id: debateId,
      p_stance: stance,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else if (data === "for" || data === "against") {
      setLockedStance(data);
      trackActivationEvent({
        event: "debate_joined",
        metadata: { debateId, stance: data },
      });
    }

    setJoining(false);
    setJoiningStance(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!lockedStance || isOverLimit || !content.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You must be signed in to submit an argument.");
      setLoading(false);
      return;
    }

    const { error: insertError } = await supabase.from("debate_arguments").insert({
      debate_id: debateId,
      author_id: user.id,
      content: content.trim(),
      round_number: roundNumber,
      stance: lockedStance,
    });

    if (insertError) {
      setError(insertError.message);
    } else {
      setContent("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setLoading(false);
  };

  if (disabled) {
    return (
      <div className="rounded-xl border border-gray-200 bg-canvas p-4 text-center text-sm text-gray-500">
        This debate is closed. No new arguments can be submitted.
      </div>
    );
  }

  if (!lockedStance) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-1 text-sm font-semibold text-gray-800">
          Choose your side
        </p>
        <p className="mb-4 text-xs leading-5 text-gray-500">
          Your position is locked once you join. You can vote separately, but
          your arguments will stay on this side.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void handleJoin("for")}
            disabled={joining}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            {joining && joiningStance === "for" ? "Joining..." : "Argue FOR"}
          </button>
          <button
            type="button"
            onClick={() => void handleJoin("against")}
            disabled={joining}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            {joining && joiningStance === "against"
              ? "Joining..."
              : "Argue AGAINST"}
          </button>
        </div>
        {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
      </div>
    );
  }

  const stanceColor =
    lockedStance === "for"
      ? "border-emerald-200 bg-emerald-100 text-emerald-700"
      : "border-amber-200 bg-amber-100 text-amber-700";

  if (submissionDisabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${stanceColor}`}
          >
            {lockedStance === "for" ? "FOR" : "AGAINST"} - Locked
          </span>
        </div>
        <div className="rounded-xl border border-gray-200 bg-canvas p-4 text-sm text-gray-500">
          Argument submission opens when the moderator starts the debate. Your
          side is saved, so you can come back ready for the opening phase.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
          {PHASE_LABELS[currentPhase]}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          {PHASE_DESCRIPTIONS[currentPhase]} Max {maxWords} words.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold ${stanceColor}`}
        >
          {lockedStance === "for" ? "FOR" : "AGAINST"} - Locked
        </span>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Your Argument</label>
          <span
            className={`text-xs font-medium ${
              isOverLimit
                ? "text-red-500"
                : wordCount > maxWords * 0.85
                  ? "text-amber-500"
                  : "text-gray-400"
            }`}
          >
            {wordCount} / {maxWords} words
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Present your argument clearly and concisely..."
          className={`w-full resize-none rounded-lg border px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 ${
            isOverLimit
              ? "border-red-300 focus:ring-red-400"
              : "border-gray-300 focus:ring-emerald-500"
          }`}
        />
        {isOverLimit ? (
          <p className="mt-1 text-xs text-red-500">
            Please shorten your argument to {maxWords} words or fewer.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Argument submitted successfully!
        </div>
      ) : null}

      <Button type="submit" loading={loading} disabled={isOverLimit || !content.trim()}>
        Submit Argument
      </Button>
    </form>
  );
}
