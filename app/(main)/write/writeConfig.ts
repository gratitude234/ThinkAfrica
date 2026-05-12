import type { PostType } from "@/lib/utils";

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
    label: "Research paper",
    minWords: 3000,
    readTime: "Multiple sessions",
    review: "Full review",
    desc: "Original research with citations and methodology",
    signalLabel: "Strongest citation path",
    portfolioValue: "Creates the clearest route to reviewed and citable academic proof.",
    requirementsSummary: "Question, method, findings, references, and enough depth.",
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
    title: "One thing I think about [topic]",
    subtitle: "A quick take from my current reading and experience",
    excerpt: "A concise point on a question worth discussing.",
    tags: ["quick take"],
    content:
      "<p><strong>My point:</strong> State the idea you want readers to leave with.</p><p><strong>Why it matters:</strong> Explain the campus, community, or African context in plain language.</p><p><strong>One example:</strong> Add a concrete example, source, or lived observation.</p><p><strong>What should happen next:</strong> End with a question or recommendation.</p>",
  },
  essay: {
    title: "Rethinking [issue] in Africa",
    subtitle: "An argument with context, evidence, and a clear position",
    excerpt: "This essay argues for a more careful way to understand the issue.",
    tags: ["essay"],
    content:
      "<h2>Opening claim</h2><p>Introduce the issue and your position.</p><h2>Context</h2><p>Explain the background readers need before they can judge the argument.</p><h2>Evidence</h2><p>Bring in examples, data, readings, or cases.</p><h2>Counterargument</h2><p>Address the strongest objection to your view.</p><h2>Conclusion</h2><p>Close with what your argument changes.</p>",
  },
  policy_brief: {
    title: "Policy brief: Improving [issue]",
    subtitle: "Problem, evidence, options, and recommendations",
    excerpt: "A short policy brief with practical recommendations.",
    tags: ["policy"],
    content:
      "<h2>Problem</h2><p>Define the policy problem and who is affected.</p><h2>Evidence</h2><p>Summarize the strongest facts, cases, or research.</p><h2>Policy options</h2><p>Compare two or three realistic choices.</p><h2>Recommendation</h2><p>State what decision-makers should do and why.</p>",
  },
  research: {
    title: "Research: [question]",
    subtitle: "A study of [topic, place, or population]",
    excerpt: "This research examines a focused question using evidence and method.",
    tags: ["research"],
    content:
      "<h2>Abstract</h2><p>Summarize the question, method, finding, and contribution.</p><h2>Introduction</h2><p>Explain the research problem and why it matters.</p><h2>Literature and context</h2><p>Position your work in existing debates.</p><h2>Method</h2><p>Describe your data, sources, or analytical approach.</p><h2>Findings</h2><p>Present the main results clearly.</p><h2>Conclusion</h2><p>Explain implications and limits.</p>",
  },
};

export function isPostType(value: string | null): value is PostType {
  return (
    value === "blog" ||
    value === "essay" ||
    value === "policy_brief" ||
    value === "research"
  );
}
