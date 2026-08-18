import { describe, expect, it } from "vitest";
import {
  formatTagLabel,
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

describe("tag hash handling", () => {
  it("strips a leading hash so '#africa' and 'africa' are one topic key", () => {
    expect(normalizeTagValue("#africa")).toBe("africa");
    expect(normalizeTagValue("##africa")).toBe("africa");
    expect(normalizeTagValue("#africa")).toBe(normalizeTagValue("Africa"));
  });

  it("keeps a hash that is not leading", () => {
    expect(normalizeTagValue("c#")).toBe("c#");
  });

  it("formats a display label without adding or keeping a hash", () => {
    expect(formatTagLabel("#African Culture")).toBe("African Culture");
    expect(formatTagLabel("African Culture")).toBe("African Culture");
    expect(formatTagLabel("#")).toBe("");
  });
});
