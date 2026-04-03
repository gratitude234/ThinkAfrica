"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";

interface ArgumentFormProps {
  debateId: string;
  roundNumber: number;
  disabled?: boolean;
}

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const wordCount = countWords(content);
  const isOverLimit = wordCount > MAX_WORDS;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      setContent("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }

    setLoading(false);
  }

  if (disabled) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
        This debate is closed. No new arguments can be submitted.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1.5">
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
          className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none ${
            isOverLimit
              ? "border-red-300 focus:ring-red-400"
              : "border-gray-300 focus:ring-emerald-500"
          }`}
        />
        {isOverLimit && (
          <p className="text-xs text-red-500 mt-1">
            Please shorten your argument to {MAX_WORDS} words or fewer.
          </p>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}
      {success && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          Argument submitted successfully!
        </div>
      )}

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
