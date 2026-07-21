import { formatRelativeTime } from "@/lib/utils";
import { isSafeSourceLinkUrl } from "@/lib/debateV2Ui";
import { ENTRY_TYPE_LABELS, RELATION_TYPE_LABELS, STANCE_LABELS } from "./labels";
import V2ReactionBar from "./V2ReactionBar";
import type { DebateV2ArgumentView } from "./types";

function getInitials(name: string | null | undefined) {
  const cleaned = name?.trim();
  if (!cleaned) return "?";
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function V2ArgumentCard({
  argument,
  debateId,
  currentUserId,
  isDebateActive,
  canRebut,
  onRebut,
  onReactionSuccess,
}: {
  argument: DebateV2ArgumentView;
  debateId: string;
  currentUserId: string | null;
  isDebateActive: boolean;
  canRebut: boolean;
  onRebut?: (argument: DebateV2ArgumentView) => void;
  onReactionSuccess: () => void;
}) {
  const authorName = argument.author?.full_name ?? argument.author?.username ?? "Unknown";
  const isFor = argument.stance === "for";

  return (
    <article
      className={`mb-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-gray-100/60 border-l-4 ${
        isFor ? "border-l-emerald-500" : "border-l-violet-600"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {argument.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={argument.author.avatar_url}
              alt={authorName}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                isFor ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"
              }`}
            >
              {getInitials(authorName)}
            </div>
          )}

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-gray-900">{authorName}</span>
              <span
                className={`rounded px-1.5 text-[10px] font-bold ${
                  isFor ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"
                }`}
              >
                {STANCE_LABELS[argument.stance].toUpperCase()}
              </span>
              {argument.entryType ? (
                <span className="rounded bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-500">
                  {ENTRY_TYPE_LABELS[argument.entryType]}
                  {argument.roundSequence ? ` · Round ${argument.roundSequence}` : ""}
                </span>
              ) : null}
            </div>
            {argument.author?.university ? (
              <p className="truncate text-xs text-gray-500">{argument.author.university}</p>
            ) : null}
          </div>
        </div>

        <span className="shrink-0 text-xs text-gray-500">{formatRelativeTime(argument.createdAt)}</span>
      </div>

      {argument.parent && argument.relationType ? (
        <p className="mb-2 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-600">
          <span className="font-semibold text-gray-700">{RELATION_TYPE_LABELS[argument.relationType]}</span>{" "}
          {argument.parent.authorName}&apos;s {STANCE_LABELS[argument.parent.stance].toLowerCase()} claim
          {argument.parent.claim ? <>: &ldquo;{argument.parent.claim}&rdquo;</> : null}
        </p>
      ) : null}

      {argument.claim ? <p className="mb-1.5 text-sm font-bold leading-snug text-gray-900">{argument.claim}</p> : null}

      <p className="mb-3 whitespace-pre-line break-words text-[15px] leading-7 text-gray-700">{argument.content}</p>

      {argument.sources.length > 0 ? (
        <ul className="mb-3 space-y-1 border-t border-gray-50 pt-2">
          {argument.sources.map((source) => (
            <li key={source.id} className="text-xs leading-5 text-gray-500">
              {isSafeSourceLinkUrl(source.url) ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all text-emerald-700 hover:underline"
                >
                  {source.title ?? source.url}
                </a>
              ) : (
                <span className="break-all text-gray-400">{source.title ?? "Source link unavailable"}</span>
              )}
              {source.publisher ? <span className="text-gray-400"> · {source.publisher}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
        <V2ReactionBar
          debateId={debateId}
          argumentId={argument.id}
          authorId={argument.authorId}
          currentUserId={currentUserId}
          isDebateActive={isDebateActive}
          counts={argument.reactionCounts}
          currentUserReactions={argument.currentUserReactions}
          onSuccess={onReactionSuccess}
        />
        {canRebut && onRebut ? (
          <button
            type="button"
            onClick={() => onRebut(argument)}
            className="text-xs font-semibold text-emerald-brand hover:underline"
          >
            Rebut this
          </button>
        ) : null}
      </div>
    </article>
  );
}
