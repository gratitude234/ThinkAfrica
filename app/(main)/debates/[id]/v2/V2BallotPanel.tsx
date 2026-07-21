"use client";

import { useId, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { DebateBallotVote } from "@/lib/debateV2";
import { violatesConfidenceRequirement } from "@/lib/debateV2Lifecycle";
import { castDebateBallotV2Action } from "./actions";
import type { DebateV2ArgumentView, DebateV2BallotResults, DebateV2OwnBallot } from "./types";

const VOTE_OPTIONS: { value: DebateBallotVote; label: string }[] = [
  { value: "for", label: "For" },
  { value: "against", label: "Against" },
  { value: "undecided", label: "Undecided" },
];

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "Not at all confident",
  2: "Slightly confident",
  3: "Moderately confident",
  4: "Very confident",
  5: "Extremely confident",
};

export function V2BallotResultsBar({ results }: { results: DebateV2BallotResults }) {
  const total = results.total || 1;
  const forPct = Math.round((results.forCount / total) * 100);
  const againstPct = Math.round((results.againstCount / total) * 100);
  const undecidedPct = Math.max(0, 100 - forPct - againstPct);

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
        <span className="h-full bg-emerald-brand" style={{ width: `${forPct}%` }} />
        <span className="h-full" style={{ width: `${againstPct}%`, background: "#7C3AED" }} />
        <span className="h-full bg-gray-300" style={{ width: `${undecidedPct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-gray-600">
        <span className="text-emerald-700">For {forPct}% ({results.forCount})</span>
        <span style={{ color: "#7C3AED" }}>Against {againstPct}% ({results.againstCount})</span>
        <span className="text-gray-500">Undecided {undecidedPct}% ({results.undecidedCount})</span>
      </div>
      <p className="mt-1 text-xs text-gray-400">
        {results.total.toLocaleString()} {results.total === 1 ? "ballot" : "ballots"}
        {results.averageConfidence !== null ? ` · avg. confidence ${results.averageConfidence.toFixed(1)}/5` : ""}
      </p>
    </div>
  );
}

export default function V2BallotPanel({
  debateId,
  stage,
  isOpenForSubmission,
  ownBallot,
  results,
  eligibleArguments,
  isAuthenticated,
  onSuccess,
}: {
  debateId: string;
  stage: "initial" | "final";
  isOpenForSubmission: boolean;
  ownBallot: DebateV2OwnBallot | null;
  results: DebateV2BallotResults | null;
  eligibleArguments?: DebateV2ArgumentView[];
  isAuthenticated: boolean;
  onSuccess: () => void;
}) {
  const formId = useId();
  const [vote, setVote] = useState<DebateBallotVote>(ownBallot?.vote ?? "for");
  const [confidence, setConfidence] = useState<number | null>(ownBallot?.confidence ?? null);
  const [reason, setReason] = useState(ownBallot?.reason ?? "");
  const [influentialArgumentId, setInfluentialArgumentId] = useState<string>(
    ownBallot?.influentialArgumentId ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const heading = stage === "initial" ? "Cast your initial ballot" : "Cast your final ballot";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (violatesConfidenceRequirement(confidence)) {
      setError("Choose a confidence level (1-5) before saving.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const result = await castDebateBallotV2Action({
      debateId,
      stage,
      vote,
      confidence: confidence as number,
      reason: reason.trim() || null,
      influentialArgumentId: stage === "final" ? influentialArgumentId || null : null,
    });

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSavedJustNow(true);
    setTimeout(() => setSavedJustNow(false), 3000);
    onSuccess();
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">{heading}</p>

      {stage === "initial" ? (
        <p className="mt-1 text-xs leading-5 text-gray-500">
          This records what you think before the debate starts. It does not lock a debater stance --
          that is chosen separately when you join as a debater.
        </p>
      ) : null}

      {!isAuthenticated ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-canvas p-4 text-center text-sm text-gray-500">
          <Link href={`/login?redirectTo=/debates/${debateId}`} className="font-medium text-emerald-600 hover:underline">
            Sign in
          </Link>{" "}
          to cast a ballot.
        </div>
      ) : !isOpenForSubmission ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-canvas p-4 text-sm text-gray-500">
          {stage === "initial"
            ? "Initial ballots are only accepted while the debate is in its open lobby."
            : "Final ballots open once the final vote round becomes active."}
          {ownBallot ? (
            <p className="mt-1 font-medium text-gray-700">
              You voted <span className="capitalize">{ownBallot.vote}</span>.
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-gray-700">Your vote</legend>
            <div className="grid grid-cols-3 gap-2">
              {VOTE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center justify-center rounded-lg border-2 px-2 py-2.5 text-sm font-semibold transition-colors ${
                    vote === option.value
                      ? "border-emerald-brand bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${formId}-vote`}
                    value={option.value}
                    checked={vote === option.value}
                    onChange={() => setVote(option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`${formId}-confidence`} className="mb-1.5 block text-sm font-medium text-gray-700">
              How confident are you?
            </label>
            <select
              id={`${formId}-confidence`}
              value={confidence ?? ""}
              onChange={(e) => setConfidence(e.target.value ? Number(e.target.value) : null)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="" disabled>
                Choose a confidence level
              </option>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level} — {CONFIDENCE_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          {stage === "final" && eligibleArguments && eligibleArguments.length > 0 ? (
            <div>
              <label htmlFor={`${formId}-influential`} className="mb-1.5 block text-sm font-medium text-gray-700">
                Which argument influenced you most? (optional)
              </label>
              <select
                id={`${formId}-influential`}
                value={influentialArgumentId}
                onChange={(e) => setInfluentialArgumentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">None in particular</option>
                {eligibleArguments.map((argument) => (
                  <option key={argument.id} value={argument.id}>
                    {(argument.claim ?? argument.content).slice(0, 60)} — {argument.author?.full_name ?? argument.author?.username ?? "Unknown"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label htmlFor={`${formId}-reason`} className="mb-1.5 block text-sm font-medium text-gray-700">
              Why? (optional)
            </label>
            <textarea
              id={`${formId}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="A short note on your reasoning..."
              className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          ) : null}
          {savedJustNow ? (
            <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Ballot saved.
            </div>
          ) : null}

          <Button type="submit" loading={submitting} disabled={submitting}>
            {ownBallot ? "Update ballot" : "Save ballot"}
          </Button>
        </form>
      )}

      <div className="mt-5 border-t border-gray-100 pt-4">
        {results ? (
          <V2BallotResultsBar results={results} />
        ) : (
          <p className="text-xs text-gray-400">
            {stage === "initial"
              ? "Aggregate results appear once you've voted, or once the lobby closes."
              : "Aggregate results appear once you've voted, or once the final vote round ends."}
          </p>
        )}
      </div>
    </section>
  );
}
