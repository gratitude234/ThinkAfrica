"use client";

/**
 * Debate V2 Phase 4A: structured cross-examination. Replaces the Phase 3
 * read-only placeholder that used to occupy this exact slot in
 * DebateV2Room's contextual action area.
 *
 * Renders whenever the cross-examination round is currently live (the
 * interactive ask/answer forms) OR whenever any exchanges already exist
 * (so they remain visible as a durable record after the round ends, per
 * the product contract's "unanswered questions remain visible after the
 * round" rule) -- see DebateV2Room's render condition for this component.
 * All authoritative rules (who may ask/answer, limits, timing) live in
 * submit_cross_examination_question_v2/submit_cross_examination_answer_v2;
 * the pure functions imported from lib/debateV2Lifecycle.ts mirror those
 * rules for instant client-side feedback only -- SQL remains authoritative.
 */

import { useId, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import type { DebateStance } from "@/lib/debateV2";
import {
  checkCrossExamAnswerEligibility,
  checkCrossExamQuestionEligibility,
  countWordsV2,
  CROSS_EXAM_ANSWER_WORD_LIMIT,
  CROSS_EXAM_QUESTION_WORD_LIMIT,
  deriveCrossExchangeStatus,
  remainingCrossExamQuestions,
  violatesCrossExamAnswerWordLimit,
  violatesCrossExamQuestionWordLimit,
} from "@/lib/debateV2Lifecycle";
import { formatRelativeTime } from "@/lib/utils";
import { CROSS_EXCHANGE_STATUS_LABELS, ROUND_PHASE_PURPOSE } from "./labels";
import { submitCrossExaminationAnswerV2Action, submitCrossExaminationQuestionV2Action } from "./actions";
import type {
  DebateV2ArgumentView,
  DebateV2CrossExchangeView,
  DebateV2DebaterSummary,
  DebateV2RoundView,
  DebateV2Status,
} from "./types";

function displayName(profile: { full_name: string | null; username: string | null } | null): string {
  return profile?.full_name ?? profile?.username ?? "Unknown";
}

function V2CrossExamQuestionForm({
  debateId,
  opposingDebaters,
  eligibleArguments,
  activeRoundSequence,
  remaining,
  onSuccess,
}: {
  debateId: string;
  opposingDebaters: DebateV2DebaterSummary[];
  eligibleArguments: DebateV2ArgumentView[];
  activeRoundSequence: number;
  remaining: number;
  onSuccess: () => void;
}) {
  const formId = useId();
  const [targetUserId, setTargetUserId] = useState("");
  const [targetArgumentId, setTargetArgumentId] = useState("");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const wordCount = countWordsV2(question);
  const isOverLimit = violatesCrossExamQuestionWordLimit(question);

  const argumentsForTarget = eligibleArguments.filter(
    (a) =>
      targetUserId !== "" &&
      a.authorId === targetUserId &&
      a.roundSequence !== null &&
      a.roundSequence < activeRoundSequence
  );

  function handleTargetChange(value: string) {
    setTargetUserId(value);
    setTargetArgumentId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!targetUserId || !question.trim() || isOverLimit) return;

    setSubmitting(true);
    setError(null);

    const result = await submitCrossExaminationQuestionV2Action({
      debateId,
      targetUserId,
      question: question.trim(),
      targetArgumentId: targetArgumentId || null,
    });

    setSubmitting(false);

    if (!result.ok) {
      // Preserve entered content on a recoverable error -- do not reset the form.
      setError(result.error);
      return;
    }

    setTargetUserId("");
    setTargetArgumentId("");
    setQuestion("");
    setJustSubmitted(true);
    setTimeout(() => setJustSubmitted(false), 3000);
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-200 bg-canvas p-3">
      <p className="text-xs font-medium text-gray-600">
        {remaining} of 2 questions remaining
      </p>

      <div>
        <label htmlFor={`${formId}-target`} className="mb-1 block text-xs font-medium text-gray-700">
          Ask
        </label>
        <select
          id={`${formId}-target`}
          value={targetUserId}
          onChange={(e) => handleTargetChange(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="" disabled>
            Choose an opposing debater
          </option>
          {opposingDebaters.map((debater) => (
            <option key={debater.userId} value={debater.userId}>
              {displayName(debater.profile)}
            </option>
          ))}
        </select>
      </div>

      {targetUserId ? (
        <div>
          <label htmlFor={`${formId}-target-argument`} className="mb-1 block text-xs font-medium text-gray-700">
            About which argument? (optional)
          </label>
          <select
            id={`${formId}-target-argument`}
            value={targetArgumentId}
            onChange={(e) => setTargetArgumentId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Not about a specific argument</option>
            {argumentsForTarget.map((argument) => (
              <option key={argument.id} value={argument.id}>
                {(argument.claim ?? argument.content).slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={`${formId}-question`} className="text-xs font-medium text-gray-700">
            Question
          </label>
          <span className={`text-xs font-medium ${isOverLimit ? "text-red-500" : "text-gray-500"}`}>
            {wordCount} / {CROSS_EXAM_QUESTION_WORD_LIMIT} words
          </span>
        </div>
        <textarea
          id={`${formId}-question`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          required
          placeholder="Ask a direct, specific question..."
          className={`w-full resize-none rounded-lg border px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 ${
            isOverLimit ? "border-red-300 focus:ring-red-400" : "border-gray-300 focus:ring-emerald-500"
          }`}
        />
        {isOverLimit ? (
          <p className="mt-1 text-xs text-red-500">Shorten your question to {CROSS_EXAM_QUESTION_WORD_LIMIT} words or fewer.</p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      ) : null}
      {justSubmitted ? (
        <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Question submitted.
        </div>
      ) : null}

      <Button
        type="submit"
        size="sm"
        loading={submitting}
        disabled={submitting || !targetUserId || !question.trim() || isOverLimit}
      >
        Ask question
      </Button>
    </form>
  );
}

function V2CrossExchangeAnswerForm({
  debateId,
  exchangeId,
  onSuccess,
}: {
  debateId: string;
  exchangeId: string;
  onSuccess: () => void;
}) {
  const formId = useId();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = countWordsV2(answer);
  const isOverLimit = violatesCrossExamAnswerWordLimit(answer);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!answer.trim() || isOverLimit) return;

    setSubmitting(true);
    setError(null);

    const result = await submitCrossExaminationAnswerV2Action({ debateId, exchangeId, answer: answer.trim() });

    setSubmitting(false);

    if (!result.ok) {
      // Preserve entered content on a recoverable error -- do not reset the form.
      setError(result.error);
      return;
    }

    setAnswer("");
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor={`${formId}-answer`} className="text-xs font-medium text-amber-900">
            Your answer
          </label>
          <span className={`text-xs font-medium ${isOverLimit ? "text-red-500" : "text-amber-700"}`}>
            {wordCount} / {CROSS_EXAM_ANSWER_WORD_LIMIT} words
          </span>
        </div>
        <textarea
          id={`${formId}-answer`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          required
          placeholder="Answer this question directly..."
          className={`w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 ${
            isOverLimit ? "border-red-300 focus:ring-red-400" : "border-amber-300 focus:ring-amber-400"
          }`}
        />
        {isOverLimit ? (
          <p className="mt-1 text-xs text-red-500">Shorten your answer to {CROSS_EXAM_ANSWER_WORD_LIMIT} words or fewer.</p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      ) : null}

      <Button type="submit" size="sm" variant="secondary" loading={submitting} disabled={submitting || !answer.trim() || isOverLimit}>
        Submit answer
      </Button>
    </form>
  );
}

function V2CrossExchangeItem({
  debateId,
  exchange,
  debateStatus,
  activeRound,
  currentUserId,
  onSuccess,
}: {
  debateId: string;
  exchange: DebateV2CrossExchangeView;
  debateStatus: DebateV2Status;
  activeRound: DebateV2RoundView | null;
  currentUserId: string | null;
  onSuccess: () => void;
}) {
  const status = deriveCrossExchangeStatus({
    hasAnswer: exchange.answer !== null,
    exchangeRoundId: exchange.roundId,
    activeRoundId: activeRound?.id ?? null,
    activeRoundPhase: activeRound?.phase ?? null,
  });

  const answerEligibility = checkCrossExamAnswerEligibility({
    debateStatus,
    activeRoundPhase: activeRound?.phase ?? null,
    exchangeRoundId: exchange.roundId,
    activeRoundId: activeRound?.id ?? null,
    targetId: exchange.targetId,
    callerUserId: currentUserId,
    alreadyAnswered: exchange.answer !== null,
  });
  const canAnswer = answerEligibility === "eligible";

  const askerName = displayName(exchange.asker);
  const targetName = displayName(exchange.target);

  return (
    <article className="rounded-lg border border-gray-100 bg-canvas p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-gray-700">{askerName}</span> asked{" "}
          <span className="font-semibold text-gray-700">{targetName}</span>
        </p>
        <span className="text-[11px] text-gray-400">{formatRelativeTime(exchange.createdAt)}</span>
      </div>

      {exchange.targetArgument ? (
        <p className="mt-1.5 rounded bg-gray-50 px-2 py-1.5 text-[11px] leading-4 text-gray-500">
          Referencing {exchange.targetArgument.authorName}&apos;s claim
          {exchange.targetArgument.claim ? <>: &ldquo;{exchange.targetArgument.claim}&rdquo;</> : null}
        </p>
      ) : null}

      <p className="mt-2 text-sm leading-6 text-gray-800">{exchange.question}</p>

      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
            status === "answered"
              ? "bg-emerald-100 text-emerald-700"
              : status === "expired_unanswered"
                ? "bg-gray-100 text-gray-500"
                : "bg-amber-100 text-amber-700"
          }`}
        >
          {CROSS_EXCHANGE_STATUS_LABELS[status]}
        </span>
      </div>

      {status === "answered" ? (
        <div className="mt-2 rounded-md border-l-2 border-emerald-300 bg-white px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{targetName}&apos;s answer</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">{exchange.answer}</p>
        </div>
      ) : canAnswer ? (
        <V2CrossExchangeAnswerForm debateId={debateId} exchangeId={exchange.id} onSuccess={onSuccess} />
      ) : status === "awaiting_answer" ? (
        <p role="status" className="mt-2 text-xs text-gray-400">
          Waiting for {targetName}&apos;s answer&hellip;
        </p>
      ) : null}
    </article>
  );
}

export default function V2CrossExamination({
  debateId,
  exchanges,
  debaters,
  arguments: allArguments,
  activeRound,
  debateStatus,
  currentUserId,
  isAuthenticated,
  ownStance,
  onSuccess,
}: {
  debateId: string;
  exchanges: DebateV2CrossExchangeView[];
  debaters: DebateV2DebaterSummary[];
  arguments: DebateV2ArgumentView[];
  activeRound: DebateV2RoundView | null;
  debateStatus: DebateV2Status;
  currentUserId: string | null;
  isAuthenticated: boolean;
  ownStance: DebateStance | null;
  onSuccess: () => void;
}) {
  const isLive = debateStatus === "active" && activeRound?.phase === "cross_examination";

  const existingQuestionCount = currentUserId ? exchanges.filter((e) => e.askerId === currentUserId).length : 0;
  const remaining = remainingCrossExamQuestions(existingQuestionCount);

  const eligibility = checkCrossExamQuestionEligibility({
    debateStatus,
    activeRoundPhase: activeRound?.phase ?? null,
    callerIsDebater: ownStance !== null,
    existingQuestionCount,
  });

  const opposingDebaters = debaters.filter((d) => d.stance !== ownStance);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500">Cross-examination</p>
      <p className="mt-1 text-sm leading-6 text-gray-600">{ROUND_PHASE_PURPOSE.cross_examination}</p>

      <div className="mt-4">
        {!isLive ? null : !isAuthenticated ? (
          <p className="rounded-lg border border-gray-200 bg-canvas p-3 text-xs text-gray-500">
            <Link href={`/login?redirectTo=/debates/${debateId}`} className="font-medium text-emerald-600 hover:underline">
              Sign in
            </Link>{" "}
            to ask a cross-examination question.
          </p>
        ) : ownStance === null ? (
          <p className="rounded-lg border border-gray-200 bg-canvas p-3 text-xs text-gray-500">
            Only joined debaters can ask or answer cross-examination questions. You can still read every exchange
            below.
          </p>
        ) : eligibility === "allowance_exhausted" ? (
          <p className="rounded-lg border border-gray-200 bg-canvas p-3 text-xs text-gray-500">
            You&apos;ve asked the maximum of 2 cross-examination questions for this debate.
          </p>
        ) : eligibility === "eligible" ? (
          <V2CrossExamQuestionForm
            debateId={debateId}
            opposingDebaters={opposingDebaters}
            eligibleArguments={allArguments}
            activeRoundSequence={activeRound!.sequenceNumber}
            remaining={remaining}
            onSuccess={onSuccess}
          />
        ) : null}
      </div>

      <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
        {exchanges.length === 0 ? (
          <p className="text-xs text-gray-400">No questions have been asked yet.</p>
        ) : (
          exchanges.map((exchange) => (
            <V2CrossExchangeItem
              key={exchange.id}
              debateId={debateId}
              exchange={exchange}
              debateStatus={debateStatus}
              activeRound={activeRound}
              currentUserId={currentUserId}
              onSuccess={onSuccess}
            />
          ))
        )}
      </div>
    </section>
  );
}
