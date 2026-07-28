import { describe, expect, it } from "vitest";
import { parseStructuredDebateRecap } from "./debateRecap";

const validRecap = {
  recap_text: "A clear recap of the motion and the community verdict.",
  key_disagreement: "The sides disagreed about who should bear the cost.",
  agreement: "Both sides agreed that access matters.",
  strongest_for: "The FOR side connected access to long-term mobility.",
  strongest_against: "The AGAINST side identified a credible funding risk.",
};

describe("parseStructuredDebateRecap", () => {
  it("parses a complete structured recap", () => {
    expect(parseStructuredDebateRecap(JSON.stringify(validRecap))).toEqual(
      validRecap
    );
  });

  it("accepts a fenced JSON response", () => {
    expect(
      parseStructuredDebateRecap(
        `\`\`\`json\n${JSON.stringify(validRecap)}\n\`\`\``
      )
    ).toEqual(validRecap);
  });

  it("rejects missing or empty fields", () => {
    expect(
      parseStructuredDebateRecap(
        JSON.stringify({ ...validRecap, agreement: "" })
      )
    ).toBeNull();
    expect(parseStructuredDebateRecap("not JSON")).toBeNull();
  });
});
