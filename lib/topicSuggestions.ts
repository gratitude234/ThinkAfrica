import {
  MAX_LONG_FORM_TOPICS,
  MAX_RESEARCH_KEYWORDS,
  MAX_SHORT_POST_TOPICS,
  MAX_TOPIC_KEY_LENGTH,
  normalizeResearchKeywords,
} from "@/lib/tags";

export type TopicSuggestionContentKind = "post" | "article" | "research";

export type TopicSuggestionRequest =
  | {
      contentKind: "post";
      body: string;
    }
  | {
      contentKind: "article";
      title: string;
      content: string;
    }
  | {
      contentKind: "research";
      title: string;
      abstract: string;
      keywords: string[];
    };

export interface TopicSuggestionResponse {
  suggestions: string[];
  remaining: number;
  resetAt: string;
}

export type TopicSuggestionState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error"
  | "quota_exhausted";

export const MIN_TOPIC_SUGGESTION_CHARACTERS = 20;
export const MAX_TOPIC_SUGGESTION_SOURCE_CHARACTERS = 100_000;
export const MAX_TOPIC_SUGGESTION_PROMPT_CHARACTERS = 12_000;

function cleanText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function topicSuggestionLimit(contentKind: TopicSuggestionContentKind) {
  return contentKind === "post"
    ? MAX_SHORT_POST_TOPICS
    : MAX_LONG_FORM_TOPICS;
}

export function topicSuggestionSourceText(request: TopicSuggestionRequest) {
  if (request.contentKind === "post") return cleanText(request.body);
  if (request.contentKind === "article") {
    return cleanText(`${request.title}\n${request.content}`);
  }
  return cleanText(
    `${request.title}\n${request.abstract}\n${request.keywords.join(", ")}`
  );
}

export function topicSuggestionFingerprint(request: TopicSuggestionRequest) {
  const source = topicSuggestionSourceText(request);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${request.contentKind}:${(hash >>> 0).toString(36)}:${source.length}`;
}

export function parseTopicSuggestionRequest(
  value: unknown
):
  | { request: TopicSuggestionRequest; sourceText: string }
  | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Invalid topic suggestion request." };
  }

  const input = value as Record<string, unknown>;
  const contentKind = input.contentKind;
  let request: TopicSuggestionRequest;

  if (contentKind === "post") {
    const body = readString(input.body);
    if (body === null) return { error: "Post text is required." };
    request = { contentKind, body };
  } else if (contentKind === "article") {
    const title = readString(input.title);
    const content = readString(input.content);
    if (title === null || content === null) {
      return { error: "Article title and content are required." };
    }
    request = { contentKind, title, content };
  } else if (contentKind === "research") {
    const title = readString(input.title);
    const abstract = readString(input.abstract);
    if (
      title === null ||
      abstract === null ||
      !Array.isArray(input.keywords) ||
      input.keywords.some((keyword) => typeof keyword !== "string")
    ) {
      return { error: "Research title, abstract, and keywords are required." };
    }
    const rawKeywords = input.keywords as string[];
    if (
      rawKeywords.length > MAX_RESEARCH_KEYWORDS ||
      rawKeywords.some(
        (keyword) =>
          keyword.trim().length === 0 ||
          keyword.trim().length > MAX_TOPIC_KEY_LENGTH
      )
    ) {
      return { error: "Research keywords are invalid." };
    }
    request = {
      contentKind,
      title,
      abstract,
      keywords: normalizeResearchKeywords(rawKeywords),
    };
  } else {
    return { error: "Unknown publication type." };
  }

  const rawLength =
    request.contentKind === "post"
      ? request.body.length
      : request.contentKind === "article"
        ? request.title.length + request.content.length
        : request.title.length +
          request.abstract.length +
          request.keywords.join("").length;
  if (rawLength > MAX_TOPIC_SUGGESTION_SOURCE_CHARACTERS) {
    return { error: "This draft is too large to analyse." };
  }

  const sourceText = topicSuggestionSourceText(request);
  if (sourceText.length < MIN_TOPIC_SUGGESTION_CHARACTERS) {
    return {
      error: `Write at least ${MIN_TOPIC_SUGGESTION_CHARACTERS} characters before requesting suggestions.`,
    };
  }

  return {
    request,
    sourceText: sourceText.slice(0, MAX_TOPIC_SUGGESTION_PROMPT_CHARACTERS),
  };
}
