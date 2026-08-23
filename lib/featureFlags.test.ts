import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorSubscriptionsUxV2Enabled, isResearchEnabled } from "./featureFlags";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Author Subscriptions UX V2 release gate", () => {
  it("stays off until Author, Topic, and UX V2 flags are all enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_AUTHOR_SUBSCRIPTIONS_UX_V2_ENABLED", "1");

    expect(isAuthorSubscriptionsUxV2Enabled()).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_TOPIC_SUBSCRIPTIONS_ENABLED", "1");
    expect(isAuthorSubscriptionsUxV2Enabled()).toBe(true);
  });
});

describe("Research release gate", () => {
  it("keeps Research unavailable until the product switch is restored", () => {
    expect(isResearchEnabled()).toBe(false);
  });
});
