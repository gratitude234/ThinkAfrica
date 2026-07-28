export interface StructuredDebateRecap {
  recap_text: string;
  key_disagreement: string;
  agreement: string;
  strongest_for: string;
  strongest_against: string;
}

const STRUCTURED_RECAP_KEYS: Array<keyof StructuredDebateRecap> = [
  "recap_text",
  "key_disagreement",
  "agreement",
  "strongest_for",
  "strongest_against",
];

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

export function parseStructuredDebateRecap(
  value: string
): StructuredDebateRecap | null {
  try {
    const parsed = JSON.parse(stripJsonFence(value)) as Record<string, unknown>;
    const hasEveryField = STRUCTURED_RECAP_KEYS.every(
      (key) => typeof parsed[key] === "string" && parsed[key].trim().length > 0
    );
    if (!hasEveryField) return null;

    return {
      recap_text: (parsed.recap_text as string).trim(),
      key_disagreement: (parsed.key_disagreement as string).trim(),
      agreement: (parsed.agreement as string).trim(),
      strongest_for: (parsed.strongest_for as string).trim(),
      strongest_against: (parsed.strongest_against as string).trim(),
    };
  } catch {
    return null;
  }
}
