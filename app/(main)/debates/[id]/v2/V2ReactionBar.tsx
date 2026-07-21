"use client";

import { useState } from "react";
import type { DebateReactionType } from "@/lib/debateV2";
import { violatesSelfReaction } from "@/lib/debateV2Lifecycle";
import { CRITICAL_REACTION_TYPES, REACTION_LABELS, TOP_REACTION_TYPES } from "./labels";
import { toggleDebateReactionV2Action } from "./actions";

const ALL_REACTIONS: readonly DebateReactionType[] = [
  "well_supported",
  "strong_reasoning",
  "clear",
  "strong_rebuttal",
  "fair_to_opposition",
  "changed_my_mind",
  "needs_evidence",
];

function pillClasses(reacted: boolean, isCritical: boolean) {
  if (!reacted) return "border-gray-200 bg-white text-gray-600 hover:bg-gray-50";
  return isCritical
    ? "border-amber-300 bg-amber-50 text-amber-700"
    : "border-emerald-300 bg-emerald-50 text-emerald-700";
}

function ReactionPill({
  type,
  count,
  reacted,
  disabled,
  onClick,
}: {
  type: DebateReactionType;
  count: number;
  reacted: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const isCritical = (CRITICAL_REACTION_TYPES as readonly string[]).includes(type);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={reacted}
      className={`inline-flex min-h-[32px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pillClasses(reacted, isCritical)}`}
    >
      <span>{REACTION_LABELS[type]}</span>
      {count > 0 ? <span aria-hidden="true" className="text-gray-400">{count}</span> : null}
    </button>
  );
}

export default function V2ReactionBar({
  debateId,
  argumentId,
  authorId,
  currentUserId,
  isDebateActive,
  counts,
  currentUserReactions,
  onSuccess,
}: {
  debateId: string;
  argumentId: string;
  authorId: string;
  currentUserId: string | null;
  isDebateActive: boolean;
  counts: Partial<Record<DebateReactionType, number>>;
  currentUserReactions: DebateReactionType[];
  onSuccess: () => void;
}) {
  const [pending, setPending] = useState<DebateReactionType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSelf = currentUserId ? violatesSelfReaction(authorId, currentUserId) : false;
  const canReact = Boolean(currentUserId) && !isSelf && isDebateActive;
  const reactedSet = new Set(currentUserReactions);

  async function handleToggle(reactionType: DebateReactionType) {
    if (!canReact || pending) return;
    setPending(reactionType);
    setError(null);

    const result = await toggleDebateReactionV2Action(debateId, argumentId, reactionType);

    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    onSuccess();
  }

  const topWithActivity = TOP_REACTION_TYPES.filter((type) => (counts[type] ?? 0) > 0 || reactedSet.has(type));
  const shown = topWithActivity.length > 0 ? topWithActivity : TOP_REACTION_TYPES;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((type) => (
        <ReactionPill
          key={type}
          type={type}
          count={counts[type] ?? 0}
          reacted={reactedSet.has(type)}
          disabled={!canReact || pending === type}
          onClick={() => void handleToggle(type)}
        />
      ))}

      <details className="relative">
        <summary className="flex min-h-[32px] cursor-pointer list-none items-center rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
          More
        </summary>
        <div className="absolute left-0 z-10 mt-1 w-60 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {ALL_REACTIONS.map((type) => (
            <button
              key={type}
              type="button"
              disabled={!canReact || pending === type}
              onClick={() => void handleToggle(type)}
              aria-pressed={reactedSet.has(type)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 ${
                reactedSet.has(type)
                  ? (CRITICAL_REACTION_TYPES as readonly string[]).includes(type)
                    ? "text-amber-700"
                    : "text-emerald-700"
                  : "text-gray-600"
              }`}
            >
              <span>{REACTION_LABELS[type]}</span>
              <span aria-hidden="true" className="text-gray-400">
                {counts[type] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </details>

      {error ? (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      ) : !currentUserId ? (
        <span className="text-xs text-gray-400">Sign in to react</span>
      ) : isSelf ? (
        <span className="text-xs text-gray-400">Your argument</span>
      ) : null}
    </div>
  );
}
