import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerReplace = vi.fn();
const searchParamsState = { draft: null as string | null };
const supabaseLoadResult = { current: { data: null as unknown } };
const ensureDraftMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "draft" ? searchParamsState.draft : null),
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve(supabaseLoadResult.current),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/activationEvents", () => ({
  trackActivationEvent: vi.fn(),
}));

vi.mock("./actions", () => ({
  ensureDraft: (...args: unknown[]) => ensureDraftMock(...args),
}));

import { useDraftManager } from "./DraftManager";

function baseDraftData(overrides: Partial<Parameters<ReturnType<typeof useDraftManager>["saveDraft"]>[0]> = {}) {
  return {
    title: "A real title",
    excerpt: "",
    content: "<p>Hello</p>",
    tags: [],
    postType: "essay",
    articleFormat: null,
    coverImageUrl: "",
    inResponseToId: null,
    ...overrides,
  };
}

describe("useDraftManager", () => {
  beforeEach(() => {
    routerReplace.mockClear();
    ensureDraftMock.mockReset();
    ensureDraftMock.mockResolvedValue({ error: null, draftId: "server-assigned-id" });
    searchParamsState.draft = null;
    supabaseLoadResult.current = { data: null };
  });

  it("forgets a stale/forged draft id when the load can't confirm it's still an editable draft owned by this user", async () => {
    searchParamsState.draft = "stale-or-published-id";
    supabaseLoadResult.current = { data: null }; // wrong owner/status/doesn't exist

    const { result } = renderHook(() => useDraftManager());

    await waitFor(() => expect(result.current.loadingDraft).toBe(false));

    result.current.saveDraft(baseDraftData());

    // Must be treated as a brand-new draft -- never as an update to the id
    // that was sitting in the URL.
    await waitFor(
      () =>
        expect(ensureDraftMock).toHaveBeenCalledWith(
          expect.objectContaining({ draftId: null })
        ),
      { timeout: 4000 }
    );
  }, 10000);

  it("does not persist a draft to the server while the title is still blank", async () => {
    const { result } = renderHook(() => useDraftManager());
    await waitFor(() => expect(result.current.loadingDraft).toBe(false));

    result.current.saveDraft(baseDraftData({ title: "" }));

    // Give the debounce window a chance to fire, then confirm nothing was sent.
    await new Promise((resolve) => setTimeout(resolve, 3300));
    expect(ensureDraftMock).not.toHaveBeenCalled();
  }, 10000);

  it("does not persist while the title is only whitespace", async () => {
    const { result } = renderHook(() => useDraftManager());
    await waitFor(() => expect(result.current.loadingDraft).toBe(false));

    result.current.saveDraft(baseDraftData({ title: "   " }));

    await new Promise((resolve) => setTimeout(resolve, 3300));
    expect(ensureDraftMock).not.toHaveBeenCalled();
  }, 10000);

  it("persists once a non-blank title exists, routed through the hardened ensureDraft server action", async () => {
    const { result } = renderHook(() => useDraftManager());
    await waitFor(() => expect(result.current.loadingDraft).toBe(false));

    result.current.saveDraft(baseDraftData({ title: "A real title" }));

    await waitFor(
      () =>
        expect(ensureDraftMock).toHaveBeenCalledWith(
          expect.objectContaining({ draftId: null, title: "A real title" })
        ),
      { timeout: 4000 }
    );
  }, 10000);

  it("hydrates initialData.articleFormat from a loaded draft's own stored genre (caught in review: PublishDrawer previously always reset this to null instead of loading it)", async () => {
    searchParamsState.draft = "draft-1";
    supabaseLoadResult.current = {
      data: {
        title: "A policy-brief-format article",
        excerpt: "",
        content: "<p>Hi</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: "policy_brief",
        cover_image_url: null,
        in_response_to: null,
      },
    };

    const { result } = renderHook(() => useDraftManager());

    await waitFor(() => expect(result.current.loadingDraft).toBe(false));
    expect(result.current.initialData?.articleFormat).toBe("policy_brief");
  });

  it("resolves initialData.articleFormat to null for a generic Article draft with no genre", async () => {
    searchParamsState.draft = "draft-1";
    supabaseLoadResult.current = {
      data: {
        title: "A generic article",
        excerpt: "",
        content: "<p>Hi</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };

    const { result } = renderHook(() => useDraftManager());

    await waitFor(() => expect(result.current.loadingDraft).toBe(false));
    expect(result.current.initialData?.articleFormat).toBeNull();
  });
});
