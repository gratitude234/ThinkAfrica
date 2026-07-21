"use client";

import { useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import type { DebateArgumentEntryType, DebateArgumentRelationType, DebateStance } from "@/lib/debateV2";
import {
  checkRebuttalParent,
  countWordsV2,
  SUBMISSION_LIMITS_V2,
  violatesSubmissionLimitV2,
  violatesWordLimitV2,
  WORD_LIMITS_V2,
  type ArgumentEntryTypeV2,
} from "@/lib/debateV2Lifecycle";
import { RELATION_TYPE_DESCRIPTIONS, RELATION_TYPE_LABELS } from "./labels";
import { submitDebateArgumentV2Action, type DebateV2SourceInput } from "./actions";
import type { DebateV2ArgumentView } from "./types";

const RELATION_TYPES: readonly DebateArgumentRelationType[] = ["supports", "challenges", "answers", "clarifies"];
const MAX_CLAIM_LENGTH = 240;
const MAX_SOURCES = 5;

interface SourceDraft {
  url: string;
  title: string;
  publisher: string;
  published_at: string;
  quoted_text: string;
}

function emptySource(): SourceDraft {
  return { url: "", title: "", publisher: "", published_at: "", quoted_text: "" };
}

export default function V2ArgumentComposer({
  debateId,
  entryType,
  ownStance,
  activeRoundSequence,
  existingCountForEntryType,
  eligibleParents,
  selectedParent,
  onClearSelectedParent,
  onSuccess,
}: {
  debateId: string;
  entryType: ArgumentEntryTypeV2;
  ownStance: DebateStance;
  activeRoundSequence: number;
  existingCountForEntryType: number;
  eligibleParents: DebateV2ArgumentView[];
  selectedParent: DebateV2ArgumentView | null;
  onClearSelectedParent: () => void;
  onSuccess: () => void;
}) {
  const formId = useId();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [claim, setClaim] = useState("");
  const [content, setContent] = useState("");
  const [parentArgumentId, setParentArgumentId] = useState<string>(selectedParent?.id ?? "");
  const [relationType, setRelationType] = useState<DebateArgumentRelationType | "">("");
  const [sources, setSources] = useState<SourceDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const isRebuttal = entryType === "rebuttal";
  const wordLimit = WORD_LIMITS_V2[entryType];
  const wordCount = countWordsV2(content);
  const isOverLimit = wordCount > wordLimit;
  const remaining = SUBMISSION_LIMITS_V2[entryType] - existingCountForEntryType;
  const allowanceUsedUp = violatesSubmissionLimitV2(entryType, existingCountForEntryType);

  useEffect(() => {
    if (selectedParent) {
      setParentArgumentId(selectedParent.id);
      contentRef.current?.focus();
      contentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedParent]);

  const selectedParentArgument = eligibleParents.find((a) => a.id === parentArgumentId) ?? null;
  const rebuttalCheck =
    isRebuttal && selectedParentArgument && relationType
      ? checkRebuttalParent({
          parentDebateId: debateId,
          ownDebateId: debateId,
          parentAuthorId: selectedParentArgument.authorId,
          callerUserId: "", // filled server-side; client only needs the stance/round checks below
          parentRoundSequence: selectedParentArgument.roundSequence,
          activeRoundSequence,
          parentStance: selectedParentArgument.stance,
          callerStance: ownStance,
          relationType,
        })
      : null;
  // rebuttalCheck is already surfaced as an inline message below the
  // relation picker -- this is what actually stops the doomed-to-fail
  // submission from reaching the server (the message alone was previously
  // decorative: the submit handler and button never consulted it).
  const hasBlockingRebuttalViolation = isRebuttal && rebuttalCheck !== null;

  function addSource() {
    setSources((prev) => (prev.length >= MAX_SOURCES ? prev : [...prev, emptySource()]));
  }

  function updateSource(index: number, patch: Partial<SourceDraft>) {
    setSources((prev) => prev.map((source, i) => (i === index ? { ...source, ...patch } : source)));
  }

  function removeSource(index: number) {
    setSources((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (isOverLimit || !content.trim() || !claim.trim()) return;
    if (isRebuttal && (!parentArgumentId || !relationType)) {
      setError("Choose which argument you're responding to and how.");
      return;
    }
    if (hasBlockingRebuttalViolation) {
      setError("Fix the rebuttal target above before submitting.");
      return;
    }

    const preparedSources: DebateV2SourceInput[] = sources
      .filter((source) => source.url.trim())
      .map((source) => ({
        url: source.url.trim(),
        title: source.title.trim() || null,
        publisher: source.publisher.trim() || null,
        published_at: source.published_at ? new Date(source.published_at).toISOString() : null,
        quoted_text: source.quoted_text.trim() || null,
      }));

    setSubmitting(true);
    setError(null);

    const result = await submitDebateArgumentV2Action({
      debateId,
      claim: claim.trim(),
      content: content.trim(),
      entryType: entryType as DebateArgumentEntryType,
      parentArgumentId: isRebuttal ? parentArgumentId : null,
      relationType: isRebuttal ? (relationType as DebateArgumentRelationType) : null,
      sources: preparedSources,
    });

    setSubmitting(false);

    if (!result.ok) {
      // Preserve entered content on a recoverable error -- do not reset the form.
      setError(result.error);
      return;
    }

    setClaim("");
    setContent("");
    setParentArgumentId("");
    setRelationType("");
    setSources([]);
    onClearSelectedParent();
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 3000);
    onSuccess();
  }

  if (allowanceUsedUp) {
    return (
      <div className="rounded-xl border border-gray-200 bg-canvas p-4 text-sm text-gray-500">
        You&apos;ve used your {entryType} submission{SUBMISSION_LIMITS_V2[entryType] > 1 ? "s" : ""} for this round.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">
          Write your {entryType} statement
          {SUBMISSION_LIMITS_V2[entryType] > 1 ? ` (${remaining} of ${SUBMISSION_LIMITS_V2[entryType]} remaining)` : ""}
        </p>
        <span className="rounded-full border-2 border-gray-200 px-2.5 py-0.5 text-xs font-bold capitalize text-gray-600">
          {ownStance}
        </span>
      </div>

      {isRebuttal ? (
        <div className="space-y-2 rounded-lg border border-gray-100 bg-canvas p-3">
          <div>
            <label htmlFor={`${formId}-parent`} className="mb-1 block text-xs font-medium text-gray-700">
              Responding to
            </label>
            <select
              id={`${formId}-parent`}
              value={parentArgumentId}
              onChange={(e) => setParentArgumentId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="" disabled>
                Choose an earlier argument
              </option>
              {eligibleParents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.stance === "for" ? "For" : "Against"} — {(parent.author?.full_name ?? parent.author?.username ?? "Unknown")}:{" "}
                  {(parent.claim ?? parent.content).slice(0, 50)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-relation`} className="mb-1 block text-xs font-medium text-gray-700">
              How does your rebuttal relate?
            </label>
            <select
              id={`${formId}-relation`}
              value={relationType}
              onChange={(e) => setRelationType(e.target.value as DebateArgumentRelationType | "")}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="" disabled>
                Choose a relation
              </option>
              {RELATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {RELATION_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            {relationType ? (
              <p className="mt-1 text-xs text-gray-500">{RELATION_TYPE_DESCRIPTIONS[relationType]}</p>
            ) : null}
          </div>

          {rebuttalCheck === "challenge_must_target_opposing_stance" ? (
            <p className="text-xs text-red-600">A direct challenge must target the opposing stance.</p>
          ) : rebuttalCheck === "not_earlier_round" ? (
            <p className="text-xs text-red-600">A rebuttal must target an argument from an earlier round.</p>
          ) : rebuttalCheck === "self_rebuttal" ? (
            <p className="text-xs text-red-600">You cannot rebut your own argument.</p>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={`${formId}-claim`} className="text-sm font-medium text-gray-700">
            Claim
          </label>
          <span className="text-xs text-gray-500">{claim.length} / {MAX_CLAIM_LENGTH}</span>
        </div>
        <input
          id={`${formId}-claim`}
          value={claim}
          onChange={(e) => setClaim(e.target.value.slice(0, MAX_CLAIM_LENGTH))}
          maxLength={MAX_CLAIM_LENGTH}
          placeholder="A one-line thesis for this argument"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={`${formId}-content`} className="text-sm font-medium text-gray-700">
            Argument
          </label>
          <span className={`text-xs font-medium ${isOverLimit ? "text-red-500" : wordCount > wordLimit * 0.85 ? "text-amber-500" : "text-gray-500"}`}>
            {wordCount} / {wordLimit} words
          </span>
        </div>
        <textarea
          ref={contentRef}
          id={`${formId}-content`}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          required
          placeholder="Present your argument clearly and concisely..."
          className={`w-full resize-none rounded-lg border px-3 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 ${
            isOverLimit ? "border-red-300 focus:ring-red-400" : "border-gray-300 focus:ring-emerald-500"
          }`}
        />
        {isOverLimit ? <p className="mt-1 text-xs text-red-500">Shorten your argument to {wordLimit} words or fewer.</p> : null}
        <p className="mt-1 text-xs text-gray-400">
          The word limit shown here is a guide -- the server enforces the authoritative limit when you submit.
        </p>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-700">Sources ({sources.length}/{MAX_SOURCES})</p>
          {sources.length < MAX_SOURCES ? (
            <button type="button" onClick={addSource} className="text-xs font-semibold text-emerald-brand hover:underline">
              + Add source
            </button>
          ) : null}
        </div>
        <div className="space-y-2">
          {sources.map((source, index) => (
            <div key={index} className="space-y-1.5 rounded-lg border border-gray-100 bg-canvas p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={source.url}
                  onChange={(e) => updateSource(index, { url: e.target.value })}
                  placeholder="https://..."
                  aria-label={`Source ${index + 1} URL`}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => removeSource(index)}
                  aria-label={`Remove source ${index + 1}`}
                  className="shrink-0 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-500 hover:bg-white"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  value={source.title}
                  onChange={(e) => updateSource(index, { title: e.target.value })}
                  placeholder="Title (optional)"
                  aria-label={`Source ${index + 1} title`}
                  className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  value={source.publisher}
                  onChange={(e) => updateSource(index, { publisher: e.target.value })}
                  placeholder="Publisher (optional)"
                  aria-label={`Source ${index + 1} publisher`}
                  className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <input
                type="date"
                value={source.published_at}
                onChange={(e) => updateSource(index, { published_at: e.target.value })}
                aria-label={`Source ${index + 1} published date`}
                className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                value={source.quoted_text}
                onChange={(e) => updateSource(index, { quoted_text: e.target.value })}
                placeholder="Quoted text (optional)"
                aria-label={`Source ${index + 1} quoted text`}
                rows={2}
                className="w-full resize-none rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {justSubmitted ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Argument submitted.
        </div>
      ) : null}

      <Button
        type="submit"
        loading={submitting}
        disabled={
          submitting ||
          isOverLimit ||
          !content.trim() ||
          !claim.trim() ||
          (isRebuttal && (!parentArgumentId || !relationType)) ||
          hasBlockingRebuttalViolation
        }
      >
        Submit
      </Button>
    </form>
  );
}
