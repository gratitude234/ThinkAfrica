import { describe, expect, it } from "vitest";
import {
  canTransitionResearchStatus,
  getResearchExitGateState,
  getResearchMetricState,
  isSafeResearchUrl,
  normalizeResearchList,
  parseResearchList,
} from "./research";

describe("research lifecycle", () => {
  it("allows forward project transitions and deliberate analysis/writing loops", () => {
    expect(canTransitionResearchStatus("proposal", "recruiting")).toBe(true);
    expect(canTransitionResearchStatus("active", "analysis")).toBe(true);
    expect(canTransitionResearchStatus("analysis", "writing")).toBe(true);
    expect(canTransitionResearchStatus("completed", "writing")).toBe(true);
  });

  it("does not silently reactivate archived projects", () => {
    expect(canTransitionResearchStatus("archived", "active")).toBe(false);
    expect(canTransitionResearchStatus("proposal", "completed")).toBe(false);
  });
});

describe("research inputs", () => {
  it("normalizes and deduplicates structured lists", () => {
    expect(
      normalizeResearchList([" Public policy ", "public   policy", "Data", ""], 4)
    ).toEqual(["Public policy", "Data"]);
    expect(parseResearchList("economics, Governance, economics")).toEqual([
      "economics",
      "Governance",
    ]);
  });

  it("accepts only bounded HTTPS research links", () => {
    expect(isSafeResearchUrl("https://example.org/dataset")).toBe(true);
    expect(isSafeResearchUrl("http://example.org/dataset")).toBe(false);
    expect(isSafeResearchUrl("HTTPS://example.org/dataset")).toBe(false);
    expect(isSafeResearchUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("research exit gate", () => {
  it("does not invent targets", () => {
    expect(
      getResearchMetricState({ value: 12, target: null, windowComplete: true })
    ).toBe("not_set");
  });

  it("distinguishes collection from a missed target", () => {
    expect(
      getResearchMetricState({ value: 2, target: 5, windowComplete: false })
    ).toBe("collecting");
    expect(
      getResearchMetricState({ value: 2, target: 5, windowComplete: true })
    ).toBe("below_target");
    expect(
      getResearchMetricState({ value: 8, target: 5, windowComplete: false })
    ).toBe("collecting");
  });

  it("reaches the gate only when every configured metric is on target", () => {
    expect(getResearchExitGateState(["on_target", "on_target"])).toBe("reached");
    expect(getResearchExitGateState(["on_target", "below_target"])).toBe(
      "not_reached"
    );
    expect(getResearchExitGateState(["on_target", "not_set"])).toBe("not_set");
  });
});
