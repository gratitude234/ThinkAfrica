"use client";

// -- ALTER TABLE debate_arguments ADD COLUMN stance text CHECK (stance IN ('for', 'against'));

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";

interface ArgumentFormProps {
  debateId: string;
  roundNumber: number;
  disabled?: boolean;
}

type Stance = "for" | "against" | null;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const MAX_WORDS = 300;

export default function ArgumentForm({
  debateId,
  roundNumber,
  disabled,
}: ArgumentFormProps) {
  const [content, setContent] = useState("");
  const [stance, setStance] = useState<Stance>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const wordCount = countWords(content);
  const isOverLimit = wordCount > MAX_WORDS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!stance) {
      setError("Please choose your stance");
      return;
    }

    if (isOverLimit || !content.trim()) return;

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

    const { error: insertError } = await supabase
      .from("debate_arguments")
      .insert({
        debate_id: debateId,
        author_id: user.id,
        content: content.trim(),
        round_number: roundNumber,
        stance,
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      setContent("");
      setStance(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setLoading(false);
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
        This debate is closed. No new arguments can be submitted.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Choose your stance</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStance("for")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              stance === "for"
                ? "bg-emerald-600 text-white"
                : "border border-gray-200 bg-gray-100 text-gray-700"
            }`}
          >
            For the motion
          </button>
          <button
            type="button"
            onClick={() => setStance("against")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              stance === "against"
                ? "bg-red-600 text-white"
                : "border border-gray-200 bg-gray-100 text-gray-700"
            }`}
          >
            Against the motion
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">
            Your Argument (Round {roundNumber})
          </label>
          <span
            className={`text-xs font-medium ${
              isOverLimit
                ? "text-red-500"
                : wordCount > MAX_WORDS * 0.85
                  ? "text-amber-500"
                  : "text-gray-400"
            }`}
          >
            {wordCount} / {MAX_WORDS} words
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Present your argument clearly and concisely (max 300 words)..."
          className={`w-full resize-none rounded-lg border px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 ${
            isOverLimit
              ? "border-red-300 focus:ring-red-400"
              : "border-gray-300 focus:ring-emerald-500"
          }`}
        />
        {isOverLimit ? (
          <p className="mt-1 text-xs text-red-500">
            Please shorten your argument to {MAX_WORDS} words or fewer.
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

      <Button
        type="submit"
        loading={loading}
        disabled={isOverLimit || !content.trim()}
      >
        Submit Argument
      </Button>
    </form>
  );
}
