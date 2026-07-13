import type { PostType } from "@/lib/utils";
import type { ResponseIntent } from "@/components/post/ResponseStartLink";

export const WRITE_FORMATS = [
  {
    type: "blog",
    label: "Quick take",
    minWords: 50,
    readTime: "~10 min to write",
    review: "Fast publish",
    desc: "One clear thought, example, or response",
    signalLabel: "Fastest publishing signal",
    portfolioValue: "Adds visible activity and gives others a reason to respond.",
    requirementsSummary: "Title, body, and at least one topic.",
  },
  {
    type: "essay",
    label: "Essay",
    minWords: 800,
    readTime: "~45 min to write",
    review: "Publish directly",
    desc: "Structured argument, cultural commentary, analysis",
    signalLabel: "Stronger portfolio depth",
    portfolioValue: "Shows sustained argument and helps selectors judge your thinking.",
    requirementsSummary: "Clear thesis, useful summary, topics, and enough depth.",
  },
  {
    type: "policy_brief",
    label: "Policy brief",
    minWords: 500,
    readTime: "~30 min to write",
    review: "Editorial review",
    desc: "Evidence-based recommendations for policymakers",
    signalLabel: "Review-eligible work",
    portfolioValue: "Builds a source-backed public record for policy audiences.",
    requirementsSummary: "Problem, evidence, recommendation, references, and topics.",
  },
  {
    type: "research",
    label: "Research paper upload",
    minWords: 3000,
    readTime: "Upload PDF",
    review: "Full review",
    desc: "Submit a finished research manuscript as a PDF",
    signalLabel: "Strongest citation path",
    portfolioValue: "Creates the clearest route to reviewed and citable academic proof.",
    requirementsSummary: "PDF, abstract, authors, topics, and references.",
  },
] as const satisfies ReadonlyArray<{
  type: PostType;
  label: string;
  minWords: number;
  readTime: string;
  review: string;
  desc: string;
  signalLabel: string;
  portfolioValue: string;
  requirementsSummary: string;
}>;

export const STARTER_TEMPLATES: Record<
  PostType,
  {
    title: string;
    subtitle: string;
    excerpt: string;
    tags: string[];
    content: string;
  }
> = {
  blog: {
    title: "One thing I noticed about [campus, country, or topic]",
    subtitle: "A quick take from class, campus, reading, or lived experience",
    excerpt: "A short argument with one point, one example, and a question for readers.",
    tags: ["quick take", "student voice"],
    content:
      "<p><strong>My point:</strong> State the one idea you want readers to remember.</p><p><strong>Why it matters:</strong> Connect it to your campus, country, community, or Africa more broadly.</p><p><strong>Evidence or example:</strong> Add a class discussion, source, statistic, news item, or lived observation.</p><p><strong>Question for readers:</strong> End with the question you want classmates or readers to answer.</p>",
  },
  essay: {
    title: "Rethinking [issue] in Africa",
    subtitle: "An argument with context, evidence, and a clear position",
    excerpt: "This essay makes a clear claim, explains why it matters, and supports it with evidence.",
    tags: ["essay"],
    content:
      "<h2>Opening claim</h2><p>Introduce the issue and your position in one clear paragraph.</p><h2>Why it matters</h2><p>Explain who is affected and why readers should care now.</p><h2>Evidence or example</h2><p>Bring in examples, data, readings, cases, or lived observations.</p><h2>Counterargument</h2><p>Address the strongest objection to your view.</p><h2>Question for readers</h2><p>Close with what your argument changes and the question others should consider next.</p>",
  },
  policy_brief: {
    title: "Policy brief: Improving [issue]",
    subtitle: "Problem, evidence, options, and recommendations",
    excerpt: "A short policy brief with a clear problem, evidence, options, and recommendation.",
    tags: ["policy"],
    content:
      "<h2>Problem</h2><p>Define the policy problem, who is affected, and why it matters now.</p><h2>Evidence</h2><p>Summarize the strongest facts, cases, research, or examples.</p><h2>Policy options</h2><p>Compare two or three realistic choices.</p><h2>Recommendation</h2><p>State what decision-makers should do and why.</p><h2>Question for implementation</h2><p>Name the tradeoff or question that still needs attention.</p>",
  },
  research: {
    title: "Research: [question]",
    subtitle: "A study of [topic, place, or population]",
    excerpt: "This research examines a focused question using evidence and method.",
    tags: ["research"],
    content:
      "<h2>Abstract</h2><p>Summarize the question, method, finding, and contribution.</p><h2>Introduction</h2><p>Explain the research problem and why it matters.</p><h2>Literature and context</h2><p>Position your work in existing debates.</p><h2>Method</h2><p>Describe your data, sources, or analytical approach.</p><h2>Findings</h2><p>Present the main results clearly.</p><h2>Implications and next question</h2><p>Explain what the finding changes, its limits, and what readers should investigate next.</p>",
  },
};

const RESPONSE_INTENT_COPY: Record<
  ResponseIntent,
  {
    titlePrefix: string;
    excerpt: string;
    tags: string[];
    claimPrompt: string;
    connectionPrompt: string;
    evidencePrompt: string;
    questionPrompt: string;
    hint: string;
  }
> = {
  extend: {
    titlePrefix: "Extending",
    excerpt: "This response extends the original idea with another angle and example.",
    tags: ["response", "student voice"],
    claimPrompt: "State what you agree with, then name the extra idea you want to add.",
    connectionPrompt: "Explain the part of the original post that your response builds from.",
    evidencePrompt: "Add a campus example, reading, statistic, case, or lived observation.",
    questionPrompt: "Ask what readers should consider next if your extension is right.",
    hint: "Start by naming the part of the argument you want to build on.",
  },
  challenge: {
    titlePrefix: "A response to",
    excerpt: "This response challenges the original argument with a different reading of the issue.",
    tags: ["response", "counterpoint"],
    claimPrompt: "State the part of the argument you think needs more care or a different conclusion.",
    connectionPrompt: "Quote or summarize the specific idea you are responding to.",
    evidencePrompt: "Bring in evidence, context, or a counterexample that changes the interpretation.",
    questionPrompt: "End with the question your challenge leaves open for readers.",
    hint: "Challenge one specific claim, not the whole writer.",
  },
  evidence: {
    titlePrefix: "Adding evidence to",
    excerpt: "This response adds evidence or an example that helps readers judge the original idea.",
    tags: ["response", "evidence"],
    claimPrompt: "Name the evidence or example you are adding and what it shows.",
    connectionPrompt: "Explain how it connects to the original post's argument.",
    evidencePrompt: "Describe the source, case, class discussion, statistic, or observation clearly.",
    questionPrompt: "Ask what more evidence would help settle the issue.",
    hint: "Lead with the example, then explain why it changes the discussion.",
  },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getResponseStarterTemplate({
  parentTitle,
  intent,
}: {
  parentTitle: string;
  intent: ResponseIntent;
}) {
  const copy = RESPONSE_INTENT_COPY[intent];
  const safeTitle = escapeHtml(parentTitle);

  return {
    title: `${copy.titlePrefix} "${parentTitle}"`,
    excerpt: copy.excerpt,
    tags: copy.tags,
    content:
      `<h2>My response</h2><p>${copy.claimPrompt}</p>` +
      `<h2>Connection to the original idea</h2><p>${copy.connectionPrompt} Original post: <strong>${safeTitle}</strong>.</p>` +
      `<h2>Evidence or example</h2><p>${copy.evidencePrompt}</p>` +
      `<h2>Question for readers</h2><p>${copy.questionPrompt}</p>`,
    hint: copy.hint,
  };
}

export function isResponseIntent(value: string | null): value is ResponseIntent {
  return value === "extend" || value === "challenge" || value === "evidence";
}

export function isPostType(value: string | null): value is PostType {
  return (
    value === "blog" ||
    value === "essay" ||
    value === "policy_brief" ||
    value === "research"
  );
}
