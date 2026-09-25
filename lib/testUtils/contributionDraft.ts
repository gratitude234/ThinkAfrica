import { vi } from "vitest";
import type { ContributionDraft } from "@/app/(write)/write/useContributionDraft";
import { contributionText, type ContributionSnapshot } from "@/lib/contribution";

export const emptySnapshot: ContributionSnapshot = {
  title: "",
  content: "",
  excerpt: "",
  tags: [],
  coverImageUrl: "",
  references: [],
};

/**
 * A stand-in for useContributionDraft, for testing one screen on its own.
 * Every action is a spy and `setSnapshot` changes nothing, so a test asserts
 * on calls. The real hook runs end to end in UniversalComposer.test.tsx.
 */
export function fakeDraft(
  snapshot: Partial<ContributionSnapshot> = {},
  overrides: Partial<ContributionDraft> = {}
): ContributionDraft {
  const current = { ...emptySnapshot, ...snapshot };
  const bodyText = contributionText(current.content);
  return {
    snapshot: current,
    setSnapshot: vi.fn(),
    saveState: "idle",
    saveError: null,
    saveLabel: "",
    recovery: null,
    restoreRecovery: vi.fn(() => null),
    dismissRecovery: vi.fn(),
    draftId: null,
    editDraftId: null,
    documentKey: "new",
    flush: vi.fn(async () => true),
    requestClose: vi.fn(async () => {}),
    navigateAway: vi.fn(),
    showLeave: false,
    closeLeave: vi.fn(),
    publish: vi.fn(async () => {}),
    publishing: false,
    publishError: null,
    discardDraft: vi.fn(async () => true),
    discarding: false,
    bodyText,
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
    ...overrides,
  };
}
