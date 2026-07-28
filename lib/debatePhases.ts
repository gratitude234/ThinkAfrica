export type DebatePhase =
  | "recruiting"
  | "opening"
  | "rebuttal"
  | "closing"
  | "voting"
  | "completed";

export const PHASE_LABELS: Record<DebatePhase, string> = {
  recruiting: "Recruiting",
  opening: "Opening Statements",
  rebuttal: "Rebuttal",
  closing: "Closing Arguments",
  voting: "Final Vote",
  completed: "Completed",
};

export const PHASE_DESCRIPTIONS: Record<DebatePhase, string> = {
  recruiting: "The moderator is confirming one debater for each side.",
  opening: "Introduce your position with your strongest argument.",
  rebuttal: "Directly address the opposing side's points.",
  closing: "Make your final, decisive case.",
  voting: "The community decides the verdict with a final vote.",
  completed: "The final vote is closed and the debate is archived.",
};

export const PHASE_WORD_LIMITS: Record<DebatePhase, number> = {
  recruiting: 0,
  opening: 300,
  rebuttal: 250,
  closing: 200,
  voting: 0,
  completed: 0,
};

export const PHASE_ROUND_MAP: Record<DebatePhase, number> = {
  recruiting: 0,
  opening: 1,
  rebuttal: 2,
  closing: 3,
  voting: 3,
  completed: 3,
};
