import { afterEach, describe, expect, it, vi } from "vitest";
import * as featureFlags from "./featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("subscription release gates", () => {
  it("are gone with author and topic subscriptions, so nothing can turn one back on", () => {
    for (const gate of [
      "isAuthorSubscriptionsEnabled",
      "isAuthorSubscriptionsUxV2Enabled",
      "isTopicSubscriptionsEnabled",
    ]) {
      expect(gate in featureFlags, gate).toBe(false);
    }
  });
});

describe("retired section switches", () => {
  it("are gone with the products they hid, so nothing can turn one back on", () => {
    expect("FEATURE_FLAGS" in featureFlags).toBe(false);
    expect("isEnabled" in featureFlags).toBe(false);
  });
});

describe("Research", () => {
  it("is removed as a product, so there is no switch to turn it back on", () => {
    expect("isResearchEnabled" in featureFlags).toBe(false);
  });

  it("no longer needs a query exclusion, because no research row exists", () => {
    // 20260915000005 normalized all five legacy research rows into Articles
    // and 20260915000006 made the value unwritable, so the filter every post
    // query used to carry has nothing to exclude.
    expect("RESEARCH_TYPE_QUERY_EXCLUSION" in featureFlags).toBe(false);
  });
});
