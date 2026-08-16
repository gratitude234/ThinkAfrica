export const CAMPUS_COHORT_STATUSES = [
  "selected",
  "active",
  "paused",
  "completed",
] as const;

export type CampusCohortStatus = (typeof CAMPUS_COHORT_STATUSES)[number];

export const CAMPUS_PROMPT_CADENCES = ["one_off", "weekly", "monthly"] as const;
export type CampusPromptCadence = (typeof CAMPUS_PROMPT_CADENCES)[number];

export const CAMPUS_PROGRAM_FORMATS = [
  "writing_circle",
  "response_circle",
  "publication_clinic",
  "debate_night",
] as const;
export type CampusProgramFormat = (typeof CAMPUS_PROGRAM_FORMATS)[number];

export const CAMPUS_PROGRAM_RECURRENCES = [
  "weekly",
  "fortnightly",
  "monthly",
  "one_off",
] as const;
export type CampusProgramRecurrence =
  (typeof CAMPUS_PROGRAM_RECURRENCES)[number];

export const CAMPUS_ACTIVITY_TYPES = [
  "prompt_shared",
  "writing_circle",
  "response_circle",
  "publication_clinic",
  "debate_night",
  "contributor_support",
] as const;
export type CampusActivityType = (typeof CAMPUS_ACTIVITY_TYPES)[number];

export const CAMPUS_METRIC_DEFINITIONS = {
  d7Retention: "Returned on the exact seventh UTC day after account creation.",
  d30Retention: "Returned on the exact thirtieth UTC day after account creation.",
  secondPublication30d:
    "Published a second contribution within 30 days of the first.",
  responseReceived30d:
    "Received a published response from another contributor within 30 days of the first publication.",
} as const;

export type CampusMetricState = "not_set" | "collecting" | "on_target" | "below_target";

export function getCampusMetricState(input: {
  rate: number | null;
  target: number | null;
  eligibleCount: number;
}): CampusMetricState {
  if (input.target === null) return "not_set";
  if (input.eligibleCount === 0 || input.rate === null) return "collecting";
  return input.rate >= input.target ? "on_target" : "below_target";
}

export function getCampusMetricStateLabel(state: CampusMetricState) {
  switch (state) {
    case "not_set":
      return "Target not set";
    case "collecting":
      return "Collecting data";
    case "on_target":
      return "On target";
    case "below_target":
      return "Below target";
  }
}

export function getCampusContributionNextAction(input: {
  publishedCount: number;
  responsesPublishedCount: number;
  promptId?: string | null;
}) {
  if (input.publishedCount === 0) {
    return {
      key: "first_publication" as const,
      title: "Publish your first campus contribution",
      description:
        "Use this week’s prompt to turn one clear observation into a public contribution.",
      href: input.promptId
        ? `/create/post?prompt=${encodeURIComponent(input.promptId)}`
        : "/create/post",
      cta: "Start a contribution",
    };
  }

  if (input.publishedCount === 1) {
    return {
      key: "second_publication" as const,
      title: "Make the second publication easier",
      description:
        "Your record has begun. Build continuity by publishing a second contribution while the first is still fresh.",
      href: input.promptId
        ? `/create/post?prompt=${encodeURIComponent(input.promptId)}`
        : "/create/post",
      cta: "Publish again",
    };
  }

  if (input.responsesPublishedCount === 0) {
    return {
      key: "first_response" as const,
      title: "Enter a response loop",
      description:
        "Strengthen another campus idea with a question, extension, or evidence-backed counterpoint.",
      href: "/responses",
      cta: "Find an idea to respond to",
    };
  }

  return {
    key: "continue_campus_loop" as const,
    title: "Keep the campus conversation moving",
    description:
      "Return to the current prompt, respond to a peer, or join the next recurring campus program.",
    href: "/campus",
    cta: "Open campus activity",
  };
}

export function formatCampusProgramValue(value: string) {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function parseOptionalPercentage(value: unknown): number | null | undefined {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return undefined;
  return Math.round(parsed * 100) / 100;
}

export function normalizeCampusName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
