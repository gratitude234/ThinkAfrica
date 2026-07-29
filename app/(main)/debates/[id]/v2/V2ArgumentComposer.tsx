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

/**
 * Drafts are keyed by the round they were written for, not merely by debate.
 * The room polls every 15s and re-renders from fresh server state, so an
 * advancing round can change this composer's entryType underneath someone
 * mid-sentence -- keying on the round keeps that person's opening statement
 * filed under the opening round rather than bleeding into the rebuttal.
 */
function draftStorageKey(
  debateId: string,
  entryType: string,
  roundSequence: number,
  userId: string | null
): string {
  return `v2-draft:${debateId}:${entryType}:${roundSequence}:${userId ?? "anon"}`;
}

interface StoredDraft {
  claim: string;
  content: string;
  parentArgumentId: string;
  relationType: string;
  sources: SourceDraft[];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readStoredDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    const claim = asString(record.claim);
    const content = asString(record.content);
    if (!claim.trim() && !content.trim()) return null;

    return {
      claim,
      content,
      parentArgumentId: asString(record.parentArgumentId),
      relationType: asString(record.relationType),
      sources: Array.isArray(record.sources)
        ? record.sources.map((entry) => {
            const source = (entry ?? {}) as Record<string, unknown>;
            return {
              url: asString(source.url),
              title: asString(source.title),
              publisher: asString(source.publisher),
              published_at: asString(source.published_at),
              quoted_text: asString(source.quoted_text),
            };
          })
        : [],
    };
  } catch {
    return null;
  }
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
  currentUserId,
}: {
  debateId: string;
  entryType: ArgumentEntryTypeV2;
  ownStance: DebateStance;
  activeRoundSequence: number;
  currentUserId: string | null;
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
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [copied, setCopied] = useState(false);

  // Which round the text currently in the form was written for. Props can
  // change under an active typist when the poll picks up an advancing round;
  // this stays put so that shift is detectable instead of silent.
  const [draftContext, setDraftContext] = useState({ entryType, activeRoundSequence });
  const hasText = Boolean(claim.trim() || content.trim());
  const hasTextRef = useRef(hasText);
  useEffect(() => {
    hasTextRef.current = hasText;
  });

  const stranded =
    hasText &&
    (draftContext.entryType !== entryType ||
      draftContext.activeRoundSequence !== activeRoundSequence);

  // An empty form has nothing to strand, so it simply follows the room.
  useEffect(() => {
    if (!hasTextRef.current) {
      setDraftContext({ entryType, activeRoundSequence });
    }
  }, [entryType, activeRoundSequence]);

  const storageKey = draftStorageKey(
    debateId,
    draftContext.entryType,
    draftContext.activeRoundSequence,
    currentUserId
  );
  const hydratedKeyRef = useRef<string | null>(null);

  // Restore whatever was last typed for this round.
  useEffect(() => {
    if (hydratedKeyRef.current === storageKey) return;
    hydratedKeyRef.current = storageKey;

    const saved = readStoredDraft(storageKey);
    if (!saved) return;

    setClaim(saved.claim);
    setContent(saved.content);
    setParentArgumentId(saved.parentArgumentId);
    setRelationType(saved.relationType as DebateArgumentRelationType | "");
    setSources(saved.sources);
    setRestoredDraft(true);
  }, [storageKey]);

  // Persist as they type. Debounced so a long argument isn't a write per
  // keystroke, and cleared outright once the form is empty again.
  useEffect(() => {
    if (hydratedKeyRef.current !== storageKey) return;

    const timer = window.setTimeout(() => {
      try {
        if (!claim.trim() && !content.trim()) {
          window.localStorage.removeItem(storageKey);
          return;
        }
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({ claim, content, parentArgumentId, relationType, sources })
        );
      } catch {
        // A full or unavailable localStorage must never break composing.
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [claim, content, parentArgumentId, relationType, sources, storageKey]);

  function clearDraftStorage() {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Nothing to recover from -- the draft is being discarded anyway.
    }
  }

  function discardStrandedDraft() {
    clearDraftStorage();
    setClaim("");
    setContent("");
    setParentArgumentId("");
    setRelationType("");
    setSources([]);
    setError(null);
    setRestoredDraft(false);
    setCopied(false);
    setDraftContext({ entryType, activeRoundSequence });
  }

  async function copyStrandedDraft() {
    try {
      await navigator.clipboard.writeText(
        claim.trim() ? `${claim.trim()}\n\n${content}` : content
      );
      setCopied(true);
    } catch {
      setError("Could not copy automatically — select the text above and copy it manually.");
    }
  }

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

    // The argument is on the record now; the local copy would only resurface
    // as a phantom draft the next time this round's composer mounts.
    clearDraftStorage();
    setClaim("");
    setContent("");
    setParentArgumentId("");
    setRelationType("");
    setSources([]);
    setRestoredDraft(false);
    onClearSelectedParent();
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 3000);
    onSuccess();
  }

  // Deliberately ahead of every other early return: once the round has moved
  // on, showing this person their own unsent words matters more than any
  // other state this composer could be in.
  if (stranded) {
    return (
      <section
        role="alert"
        className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
      >
        <div>
          <p className="text-sm font-semibold text-amber-900">
            The debate moved on while you were writing.
          </p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            You were writing your {draftContext.entryType} statement, but this
            round is now the {entryType}. Your text has not been sent and has
            not been changed — it is kept below so you can copy it before
            starting your {entryType}.
          </p>
        </div>

        {claim.trim() ? (
          <p className="rounded-lg border border-amber-200 bg-white p-3 text-sm font-semibold text-gray-800">
            {claim}
          </p>
        ) : null}
        <textarea
          readOnly
          value={content}
          rows={8}
          aria-label={`Your unsent ${draftContext.entryType} statement`}
          className="w-full rounded-lg border border-amber-200 bg-white p-3 text-sm leading-6 text-gray-800"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={copyStrandedDraft}>
            {copied ? "Copied" : "Copy my text"}
          </Button>
          <Button type="button" variant="secondary" onClick={discardStrandedDraft}>
            Discard and write my {entryType}
          </Button>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </section>
    );
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

      {restoredDraft ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
        >
          Restored the draft you had here earlier. It has not been submitted.
        </p>
      ) : null}

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
