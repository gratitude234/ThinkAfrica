"use client";

import { useMemo, useState } from "react";
import TagInput from "@/components/ui/TagInput";
import { isAiTopicSuggestionsEnabled } from "@/lib/featureFlags";
import {
  CANONICAL_TAGS,
  normalizeAndDedupeTopicValues,
  normalizeTagValue,
} from "@/lib/tags";
import { trackActivationEvent } from "@/lib/activationEvents";
import {
  MIN_TOPIC_SUGGESTION_CHARACTERS,
  topicSuggestionFingerprint,
  topicSuggestionSourceText,
  type TopicSuggestionContentKind,
  type TopicSuggestionRequest,
  type TopicSuggestionResponse,
  type TopicSuggestionState,
} from "@/lib/topicSuggestions";

interface PublishingTopicSelectorProps {
  contentKind: TopicSuggestionContentKind;
  value: string[];
  onChange: (topics: string[]) => void;
  maxTopics: number;
  title?: string;
  content?: string;
  abstract?: string;
  keywords?: string[];
  disabled?: boolean;
  id?: string;
}

function buildRequest({
  contentKind,
  title = "",
  content = "",
  abstract = "",
  keywords = [],
}: Pick<
  PublishingTopicSelectorProps,
  "contentKind" | "title" | "content" | "abstract" | "keywords"
>): TopicSuggestionRequest {
  if (contentKind === "post") {
    return { contentKind, body: content };
  }
  if (contentKind === "article") {
    return { contentKind, title, content };
  }
  return { contentKind, title, abstract, keywords };
}

const CONTEXT_LABELS: Record<TopicSuggestionContentKind, string> = {
  post: "post",
  article: "article",
  research: "research",
};

export default function PublishingTopicSelector({
  contentKind,
  value,
  onChange,
  maxTopics,
  title,
  content,
  abstract,
  keywords,
  disabled = false,
  id,
}: PublishingTopicSelectorProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [state, setState] = useState<TopicSuggestionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysedFingerprint, setAnalysedFingerprint] = useState<string | null>(
    null
  );
  const [remaining, setRemaining] = useState<number | null>(null);

  const request = useMemo(
    () =>
      buildRequest({
        contentKind,
        title,
        content,
        abstract,
        keywords,
      }),
    [abstract, content, contentKind, keywords, title]
  );
  const fingerprint = useMemo(
    () => topicSuggestionFingerprint(request),
    [request]
  );
  const sourceLength = topicSuggestionSourceText(request).length;
  const stale = Boolean(
    analysedFingerprint && analysedFingerprint !== fingerprint
  );
  const aiEnabled = isAiTopicSuggestionsEnabled();
  const contextLabel = CONTEXT_LABELS[contentKind];

  const changeTopics = (topics: string[]) => {
    onChange(normalizeAndDedupeTopicValues(topics, maxTopics));
  };

  const toggleTopic = (topic: string, source: "ai" | "catalogue") => {
    const normalized = normalizeTagValue(topic);
    if (value.includes(normalized)) {
      changeTopics(value.filter((candidate) => candidate !== normalized));
      return;
    }
    if (value.length >= maxTopics) return;
    changeTopics([...value, normalized]);
    if (source === "ai") {
      trackActivationEvent({
        event: "ai_topic_suggestion_selected",
        metadata: {
          contentKind,
          suggestionPosition: Math.max(suggestions.indexOf(topic), 0),
        },
      });
    }
  };

  const requestSuggestions = async () => {
    if (
      disabled ||
      state === "loading" ||
      sourceLength < MIN_TOPIC_SUGGESTION_CHARACTERS
    ) {
      return;
    }

    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/topic-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const result = (await response.json().catch(() => ({}))) as Partial<
        TopicSuggestionResponse & { error: string }
      >;

      if (!response.ok) {
        setState(response.status === 429 ? "quota_exhausted" : "error");
        setError(
          result.error ??
            "AI suggestions are unavailable. You can still add topics manually."
        );
        return;
      }

      const nextSuggestions = Array.isArray(result.suggestions)
        ? result.suggestions.filter(
            (topic): topic is string => typeof topic === "string"
          )
        : [];
      setSuggestions(nextSuggestions);
      setRemaining(
        typeof result.remaining === "number" ? result.remaining : null
      );
      setAnalysedFingerprint(fingerprint);
      setState(nextSuggestions.length > 0 ? "ready" : "empty");
    } catch {
      setState("error");
      setError(
        "AI suggestions are unavailable. You can still add topics manually."
      );
    }
  };

  const displayedSuggestions =
    state === "ready" && !stale
      ? suggestions
      : CANONICAL_TAGS.slice(0, 8);
  const suggestionSource =
    state === "ready" && !stale ? "ai" : "catalogue";

  return (
    <div id={id}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-ink">Topics (optional)</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Help interested readers discover this {contextLabel}.
          </p>
        </div>
        <span className="text-xs text-gray-400">
          {value.length}/{maxTopics}
        </span>
      </div>

      {aiEnabled ? (
        <div className="mb-3 rounded-lg border border-purple-100 bg-purple-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-purple-900">
                AI topic suggestions
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-purple-700">
                Gemini analyses this draft only when you choose this.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void requestSuggestions()}
              disabled={
                disabled ||
                state === "loading" ||
                sourceLength < MIN_TOPIC_SUGGESTION_CHARACTERS
              }
              className="inline-flex min-h-9 items-center rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 transition-colors hover:border-purple-300 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === "loading"
                ? "Analysing..."
                : stale
                  ? "Refresh suggestions"
                  : analysedFingerprint
                    ? "Suggest again"
                    : "Suggest topics with AI"}
            </button>
          </div>
          {sourceLength < MIN_TOPIC_SUGGESTION_CHARACTERS ? (
            <p className="mt-2 text-[11px] text-gray-500">
              Write a little more before requesting suggestions.
            </p>
          ) : null}
          <div aria-live="polite" className="mt-2 text-[11px] text-gray-600">
            {stale
              ? "The draft changed after these suggestions were generated."
              : state === "empty"
                ? "No close catalogue match was found. Add a topic manually if needed."
                : error}
            {!stale && state === "ready" && remaining !== null
              ? ` ${remaining} AI requests remaining today.`
              : null}
          </div>
        </div>
      ) : null}

      <p className="mb-2 text-xs font-medium text-gray-500">
        {suggestionSource === "ai"
          ? `Suggested for this ${contextLabel}`
          : "Popular topics"}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {displayedSuggestions.map((topic) => {
          const normalized = normalizeTagValue(topic);
          const selected = value.includes(normalized);
          const topicDisabled =
            disabled || (!selected && value.length >= maxTopics);
          return (
            <button
              key={topic}
              type="button"
              onClick={() => toggleTopic(topic, suggestionSource)}
              disabled={topicDisabled}
              aria-pressed={selected}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? "border-emerald-brand bg-green-tint text-emerald-brand"
                  : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand hover:text-emerald-brand disabled:cursor-not-allowed disabled:opacity-45"
              }`}
            >
              {topic}
            </button>
          );
        })}
      </div>

      <TagInput
        value={value}
        maxTags={maxTopics}
        showLabel={false}
        disabled={disabled}
        placeholder={
          value.length >= maxTopics ? "Topic limit reached" : "Add a topic"
        }
        onChange={changeTopics}
      />
    </div>
  );
}
