"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "./actions";

export default function SubmitReviewForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<
    "accept" | "revise" | "reject"
  >("accept");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const result = await submitReview({ postId, recommendation, notes });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.push("/review");
    router.refresh();
  };

  return (
    <div className="space-y-4 rounded-xl border border-purple-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Submit review</h2>
        <p className="mt-1 text-sm text-gray-500">
          Provide your recommendation and any notes for the author/editor.
        </p>
      </div>

      <select
        value={recommendation}
        onChange={(event) =>
          setRecommendation(event.target.value as "accept" | "revise" | "reject")
        }
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
      >
        <option value="accept">Accept</option>
        <option value="revise">Revise</option>
        <option value="reject">Reject</option>
      </select>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={8}
        placeholder="Share the key strengths, concerns, and requested revisions."
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {loading ? "Submitting..." : "Submit review"}
      </button>
    </div>
  );
}
