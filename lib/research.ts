export const RESEARCH_PROJECT_STATUSES = [
  "proposal",
  "recruiting",
  "active",
  "analysis",
  "writing",
  "completed",
  "archived",
] as const;

export type ResearchProjectStatus = (typeof RESEARCH_PROJECT_STATUSES)[number];

export const RESEARCH_PROJECT_ROLES = [
  "lead",
  "researcher",
  "data_analyst",
  "field_researcher",
  "writer",
  "advisor",
  "contributor",
] as const;

export type ResearchProjectRole = (typeof RESEARCH_PROJECT_ROLES)[number];

export const RESEARCH_UPDATE_TYPES = [
  "progress",
  "milestone",
  "finding",
  "challenge",
  "field_note",
] as const;

export type ResearchUpdateType = (typeof RESEARCH_UPDATE_TYPES)[number];

export const RESEARCH_ASSET_TYPES = [
  "image",
  "audio",
  "video",
  "dataset",
  "document",
  "external_link",
] as const;

export type ResearchAssetType = (typeof RESEARCH_ASSET_TYPES)[number];

export const RESEARCH_COLLABORATION_STATUSES = [
  "open",
  "selective",
  "not_open",
] as const;

export type ResearchCollaborationStatus =
  (typeof RESEARCH_COLLABORATION_STATUSES)[number];

const STATUS_TRANSITIONS: Record<
  ResearchProjectStatus,
  readonly ResearchProjectStatus[]
> = {
  proposal: ["recruiting", "active", "archived"],
  recruiting: ["active", "archived"],
  active: ["analysis", "writing", "completed", "archived"],
  analysis: ["active", "writing", "completed", "archived"],
  writing: ["active", "analysis", "completed", "archived"],
  completed: ["writing", "archived"],
  archived: [],
};

export function getResearchStatusTransitions(status: ResearchProjectStatus) {
  return STATUS_TRANSITIONS[status];
}

export function canTransitionResearchStatus(
  from: ResearchProjectStatus,
  to: ResearchProjectStatus
) {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function formatResearchValue(value: string) {
  return value
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function normalizeResearchList(values: readonly string[], limit = 12) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const cleaned = value.trim().replace(/\s+/g, " ");
    const key = cleaned.toLocaleLowerCase();
    if (!cleaned || cleaned.length > 80 || seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
    if (normalized.length === limit) break;
  }

  return normalized;
}

export function parseResearchList(value: string, limit = 12) {
  return normalizeResearchList(value.split(","), limit);
}

export function isSafeResearchUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("https://") || trimmed.length > 2000) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export type ResearchMetricState =
  | "not_set"
  | "collecting"
  | "on_target"
  | "below_target";

export function getResearchMetricState(input: {
  value: number;
  target: number | null;
  windowComplete: boolean;
}): ResearchMetricState {
  if (input.target === null) return "not_set";
  if (!input.windowComplete) return "collecting";
  return input.value >= input.target ? "on_target" : "below_target";
}

export function getResearchMetricStateLabel(state: ResearchMetricState) {
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

export function getResearchExitGateState(states: readonly ResearchMetricState[]) {
  if (states.some((state) => state === "not_set")) return "not_set" as const;
  if (states.some((state) => state === "collecting")) return "collecting" as const;
  if (states.every((state) => state === "on_target")) return "reached" as const;
  return "not_reached" as const;
}

export const RESEARCH_EXIT_METRICS = [
  {
    key: "proposalsCreated",
    label: "Proposals created",
    definition: "Research projects created during the measurement window.",
  },
  {
    key: "activeProjects",
    label: "Active projects",
    definition: "Projects currently in active research, analysis, or writing.",
  },
  {
    key: "acceptedCollaborations",
    label: "Accepted collaborations",
    definition: "Collaboration requests accepted during the measurement window.",
  },
  {
    key: "completedProjects",
    label: "Completed projects",
    definition: "Projects completed during the measurement window.",
  },
  {
    key: "publicUpdates",
    label: "Public project updates",
    definition: "Public progress notes, findings, and milestones shared in the window.",
  },
  {
    key: "multimediaAssets",
    label: "Research assets",
    definition: "Images, audio, video, datasets, and documents added in the window.",
  },
] as const;
