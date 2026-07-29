import { describe, expect, it } from "vitest";
import {
  getTopicValuesValidationError,
  isSubscribableTopicValue,
  normalizeTagValue,
} from "./tags";

describe("topic key normalization", () => {
  it("uses lowercase trimmed keys with collapsed whitespace", () => {
    expect(normalizeTagValue("  Climate   Policy ")).toBe("climate policy");
  });

  it("accepts 80 characters and rejects longer or blank topics", () => {
    expect(isSubscribableTopicValue("a".repeat(80))).toBe(true);
    expect(isSubscribableTopicValue("a".repeat(81))).toBe(false);
    expect(isSubscribableTopicValue("   ")).toBe(false);
    expect(getTopicValuesValidationError(["valid", "a".repeat(81)])).toMatch(
      /between 1 and 80/
    );
  });
});
