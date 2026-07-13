import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";
import { WRITE_FORMATS } from "./writeConfig";

export type DraftCoachingItemKey =
  | "clear_point"
  | "why_it_matters"
  | "evidence_example"
  | "useful_summary"
  | "reader_question"
  | "format_requirement"
  | "response_context";

export interface DraftCoachingItem {
  key: DraftCoachingItemKey;
  label: string;
  helper: string;
  done: boolean;
  blocking: boolean;
}

export interface DraftCoachingSummary {
  primaryAction: DraftCoachingItem;
  items: DraftCoachingItem[];
  completedCount: number;
  totalCount: number;
  formatHint: string;
  formatLabel: string;
}

interface DraftCoachingInput {
  postType: PostType;
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  references: PostReferenceRecord[];
  wordCount: number;
  inResponseToTitle: string | null;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function includesAny(value: string, needles: string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function hasUsefulQuestion(value: string) {
  return value.includes("?") || includesAny(value, ["what should", "how should", "why should"]);
}

function getFormatHint(postType: PostType, isResponse: boolean) {
  if (isResponse) {
    return "Anchor your response in the original idea, then add your own claim, evidence, and question.";
  }
  if (postType === "policy_brief") {
    return "Make the problem, evidence, options, and recommendation easy to scan.";
  }
  if (postType === "essay") {
    return "Build a sustained argument with context, evidence, and a fair counterpoint.";
  }
  if (postType === "research") {
    return "Research uploads should move through the dedicated research submission flow.";
  }
  return "A strong quick take needs one point, why it matters, one example, and a question.";
}

export function getDraftCoachingSummary(
  input: DraftCoachingInput
): DraftCoachingSummary {
  const body = stripHtml(input.content);
  const lowerBody = body.toLowerCase();
  const selectedFormat =
    WRITE_FORMATS.find((format) => format.type === input.postType) ?? WRITE_FORMATS[0];
  const needsReferences =
    input.postType === "research" || input.postType === "policy_brief";
  const referenceCount = input.references.filter((reference) =>
    reference.title?.trim()
  ).length;
  const titleDone = input.title.trim().length >= 8;
  const bodyStarted = body.length > 0;
  const hasWhy =
    includesAny(lowerBody, [
      "why it matters",
      "this matters",
      "important because",
      "matters because",
      "significant because",
    ]);
  const hasEvidence =
    includesAny(lowerBody, [
      "for example",
      "evidence",
      "source",
      "data",
      "case",
      "statistic",
      "study",
      "observed",
    ]) || referenceCount > 0;
  const hasSummary = input.excerpt.trim().length >= 24;
  const hasQuestion = hasUsefulQuestion(body);
  const reachesFormatDepth =
    input.postType === "blog"
      ? input.wordCount >= 50
      : input.wordCount >= Math.min(selectedFormat.minWords, 500);

  const items: DraftCoachingItem[] = [
    {
      key: "clear_point",
      label: "Clear point",
      helper: titleDone
        ? "The title gives readers a usable signal."
        : "Use the title to name the claim, question, or observation.",
      done: titleDone && bodyStarted,
      blocking: false,
    },
    {
      key: "why_it_matters",
      label: "Why it matters",
      helper: hasWhy
        ? "The draft explains relevance."
        : "Connect the idea to campus, community, country, or Africa more broadly.",
      done: hasWhy,
      blocking: false,
    },
    {
      key: "evidence_example",
      label: "Evidence or example",
      helper: hasEvidence
        ? "The draft includes support readers can judge."
        : "Add a class example, source, case, statistic, or lived observation.",
      done: hasEvidence,
      blocking: false,
    },
    {
      key: "useful_summary",
      label: "Useful summary",
      helper: hasSummary
        ? "The feed summary can help readers decide to open it."
        : "Add a one-sentence summary in the publish review.",
      done: hasSummary,
      blocking: false,
    },
    {
      key: "reader_question",
      label: "Reader question",
      helper: hasQuestion
        ? "The draft invites a response."
        : "End with a question others can answer or challenge.",
      done: hasQuestion,
      blocking: false,
    },
    {
      key: "format_requirement",
      label: needsReferences ? "Reference requirement" : "Format depth",
      helper: needsReferences
        ? referenceCount > 0
          ? `${referenceCount} reference${referenceCount === 1 ? "" : "s"} added.`
          : "Policy briefs and research need at least one structured reference."
        : reachesFormatDepth
          ? "This has enough depth for the selected format."
          : `Aim for at least ${selectedFormat.minWords.toLocaleString()} words for this format.`,
      done: needsReferences ? referenceCount > 0 : reachesFormatDepth,
      blocking: needsReferences,
    },
  ];

  if (input.inResponseToTitle) {
    items.push({
      key: "response_context",
      label: "Response context",
      helper: `Connected to "${input.inResponseToTitle}".`,
      done: true,
      blocking: false,
    });
  }

  const primaryAction = items.find((item) => !item.done) ?? items[0];

  return {
    primaryAction,
    items,
    completedCount: items.filter((item) => item.done).length,
    totalCount: items.length,
    formatHint: getFormatHint(input.postType, Boolean(input.inResponseToTitle)),
    formatLabel: selectedFormat.label,
  };
}
