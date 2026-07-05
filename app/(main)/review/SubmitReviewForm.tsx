"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitReview } from "./actions";

type EvidenceSupport = "yes" | "partial" | "no";
type Readiness = "ready" | "revise" | "not_ready";

const EVIDENCE_LABELS: Record<EvidenceSupport, string> = {
  yes: "Yes",
  partial: "Partially",
  no: "No",
};

const READINESS_LABELS: Record<Readiness, string> = {
  ready: "Ready to publish",
  revise: "Needs revision",
  not_ready: "Not ready",
};

function composeNotes(input: {
  evidenceSupport: EvidenceSupport;
  readiness: Readiness;
  additionalNotes: string;
}) {
  const lines = [
    `Evidence supports the claim: ${EVIDENCE_LABELS[input.evidenceSupport]}`,
    `Publish readiness: ${READINESS_LABELS[input.readiness]}`,
  ];

  if (input.additionalNotes.trim()) {
    lines.push(`Note: ${input.additionalNotes.trim()}`);
  }

  return lines.join("\n");
}

export default function SubmitReviewForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [recommendation, setRecommendation] = useState<
    "accept" | "revise" | "reject"
  >("accept");
  const [evidenceSupport, setEvidenceSupport] = useState<EvidenceSupport>("yes");
  const [readiness, setReadiness] = useState<Readiness>("ready");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const notes = composeNotes({ evidenceSupport, readiness, additionalNotes });
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
          Answer a couple of quick questions, then give your overall recommendation.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Is the core claim/argument supported by evidence?
        </label>
        <select
          value={evidenceSupport}
          onChange={(event) => setEvidenceSupport(event.target.value as EvidenceSupport)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          <option value="yes">Yes</option>
          <option value="partial">Partially</option>
          <option value="no">No</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Is this ready to publish as-is, or does it need revision?
        </label>
        <select
          value={readiness}
          onChange={(event) => setReadiness(event.target.value as Readiness)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          <option value="ready">Ready to publish</option>
          <option value="revise">Needs revision</option>
          <option value="not_ready">Not ready</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Anything specific the author should know?{" "}
          <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <textarea
          value={additionalNotes}
          onChange={(event) => setAdditionalNotes(event.target.value)}
          rows={4}
          placeholder="Any specific strengths, concerns, or requested changes."
          className="mt-1 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Overall recommendation
        </label>
        <select
          value={recommendation}
          onChange={(event) =>
            setRecommendation(event.target.value as "accept" | "revise" | "reject")
          }
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
        >
          <option value="accept">Accept</option>
          <option value="revise">Revise</option>
          <option value="reject">Reject</option>
        </select>
      </div>

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
