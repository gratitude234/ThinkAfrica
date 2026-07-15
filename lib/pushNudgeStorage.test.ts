import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPushNudgeMemoryForTests,
  loadPushNudgeState,
  pushNudgeStorageKey,
  savePushNudgeState,
} from "@/lib/pushNudgeStorage";
import { createEmptyPushNudgeState } from "@/lib/pushPromptPolicy";

describe("push nudge storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearPushNudgeMemoryForTests();
  });

  it("isolates state by user", () => {
    savePushNudgeState("user-a", { ...createEmptyPushNudgeState(), offersShown: 2 });
    expect(loadPushNudgeState("user-a", null, "default").offersShown).toBe(2);
    expect(loadPushNudgeState("user-b", null, "default").offersShown).toBe(0);
  });

  it("repairs corrupt local storage from legacy seed", () => {
    window.localStorage.setItem(pushNudgeStorageKey("user-a"), "not-json");
    const state = loadPushNudgeState(
      "user-a",
      { attemptCount: 2, lastShownAt: "2026-07-01T00:00:00.000Z", shownAt: null },
      "default"
    );
    expect(state.offersShown).toBe(2);
  });

  it("falls back to memory when localStorage writes fail", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    savePushNudgeState("user-a", { ...createEmptyPushNudgeState(), offersShown: 1 });
    expect(loadPushNudgeState("user-a", null, "default").offersShown).toBe(1);
    spy.mockRestore();
  });
});
