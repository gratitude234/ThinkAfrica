export type DebatePhase = "opening" | "rebuttal" | "closing";

export const PHASE_LABELS: Record<DebatePhase, string> = {
  opening: "Opening Statements",
  rebuttal: "Rebuttal",
  closing: "Closing Arguments",
};

export const PHASE_DESCRIPTIONS: Record<DebatePhase, string> = {
  opening: "Introduce your position with your strongest argument.",
  rebuttal: "Directly address the opposing side's points.",
  closing: "Make your final, decisive case.",
};

export const PHASE_WORD_LIMITS: Record<DebatePhase, number> = {
  opening: 300,
  rebuttal: 250,
  closing: 200,
};

export const PHASE_ROUND_MAP: Record<DebatePhase, number> = {
  opening: 1,
  rebuttal: 2,
  closing: 3,
};
