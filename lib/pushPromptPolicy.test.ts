import { describe, expect, it } from "vitest";
import {
  PUSH_PROMPT_COOLDOWN_MS,
  createEmptyPushNudgeState,
  getPushNudgeDecision,
  recordDeniedRecoveryImpression,
  recordPushOfferImpression,
  recordPushPermissionDenied,
  recordPushPermissionRestored,
  seedPushNudgeState,
} from "@/lib/pushPromptPolicy";

const NOW = new Date("2026-07-15T12:00:00.000Z");

describe("push nudge policy", () => {
  it("allows three offers and starts cooldown on every impression", () => {
    let state = createEmptyPushNudgeState();
    for (let offer = 1; offer <= 3; offer += 1) {
      expect(getPushNudgeDecision({ state, supported: true, permission: "default", subscribed: false, now: NOW })).toBe("offer");
      state = recordPushOfferImpression(state, NOW);
      expect(state.offersShown).toBe(offer);
      expect(getPushNudgeDecision({ state, supported: true, permission: "default", subscribed: false, now: NOW })).toBe("none");
      if (offer < 3) {
        state = { ...state, lastOfferedAt: new Date(NOW.getTime() - PUSH_PROMPT_COOLDOWN_MS).toISOString() };
      }
    }
    expect(getPushNudgeDecision({ state, supported: true, permission: "default", subscribed: false, now: NOW })).toBe("none");
  });

  it("becomes eligible at the exact 20-day boundary", () => {
    const state = {
      ...createEmptyPushNudgeState(),
      offersShown: 1,
      lastOfferedAt: new Date(NOW.getTime() - PUSH_PROMPT_COOLDOWN_MS).toISOString(),
    };
    expect(getPushNudgeDecision({ state, supported: true, permission: "default", subscribed: false, now: NOW })).toBe("offer");
  });

  it("suppresses unsupported, subscribed, and explicitly disabled devices", () => {
    const state = createEmptyPushNudgeState();
    expect(getPushNudgeDecision({ state, supported: false, permission: "default", subscribed: false, now: NOW })).toBe("none");
    expect(getPushNudgeDecision({ state, supported: true, permission: "granted", subscribed: true, now: NOW })).toBe("none");
    expect(getPushNudgeDecision({ state: { ...state, disabledByUser: true }, supported: true, permission: "default", subscribed: false, now: NOW })).toBe("none");
  });

  it("shows one denied recovery reminder after 20 days", () => {
    let state = recordPushPermissionDenied(createEmptyPushNudgeState(), NOW);
    expect(getPushNudgeDecision({ state, supported: true, permission: "denied", subscribed: false, now: NOW })).toBe("none");
    const later = new Date(NOW.getTime() + PUSH_PROMPT_COOLDOWN_MS);
    expect(getPushNudgeDecision({ state, supported: true, permission: "denied", subscribed: false, now: later })).toBe("denied-recovery");
    state = recordDeniedRecoveryImpression(state);
    expect(getPushNudgeDecision({ state, supported: true, permission: "denied", subscribed: false, now: later })).toBe("none");
  });

  it("clears denial state when permission is restored", () => {
    const restored = recordPushPermissionRestored(recordPushPermissionDenied(createEmptyPushNudgeState(), NOW));
    expect(restored.deniedAt).toBeNull();
    expect(getPushNudgeDecision({ state: restored, supported: true, permission: "granted", subscribed: false, now: NOW })).toBe("offer");
  });
});

describe("legacy seeding", () => {
  it.each([0, 1, 2, 3, 4])("clamps legacy attempt count %i", (attemptCount) => {
    const state = seedPushNudgeState({ attemptCount, lastShownAt: "2026-07-01T00:00:00.000Z", shownAt: null }, "default", NOW);
    expect(state.offersShown).toBe(Math.min(3, attemptCount));
  });

  it("treats an onboarding-only timestamp as one prior offer", () => {
    const state = seedPushNudgeState({ attemptCount: 0, lastShownAt: null, shownAt: "2026-07-10T00:00:00.000Z" }, "default", NOW);
    expect(state.offersShown).toBe(1);
    expect(state.lastOfferedAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("uses the legacy timestamp for denied recovery", () => {
    const state = seedPushNudgeState({ attemptCount: 1, lastShownAt: "2026-06-01T00:00:00.000Z", shownAt: null }, "denied", NOW);
    expect(state.deniedAt).toBe("2026-06-01T00:00:00.000Z");
  });
});
