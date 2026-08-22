import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routerReplace = vi.fn();
const searchParamsState = {
  draft: null as string | null,
  inResponseTo: null as string | null,
  response_to: null as string | null,
  starter: null as string | null,
  tag: null as string | null,
};
const supabaseLoadResult = { current: { data: null as unknown } };
const ensureDraftMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => ({
    get: (key: string) =>
      searchParamsState[key as keyof typeof searchParamsState] ?? null,
    toString: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(searchParamsState)) {
        if (value) params.set(key, value);
      }
      return params.toString();
    },
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

import {
  getDraftBackupStorageKey,
  useDraftManager,
} from "./DraftManager";

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
    localStorage.clear();
    routerReplace.mockClear();
    ensureDraftMock.mockReset();
    ensureDraftMock.mockResolvedValue({ error: null, draftId: "server-assigned-id" });
    Object.assign(searchParamsState, {
      draft: null,
      inResponseTo: null,
      response_to: null,
      starter: null,
      tag: null,
    });
    supabaseLoadResult.current = { data: null };
  });

  it("forgets a stale/forged draft id when the load can't confirm it's still an editable draft owned by this user", async () => {
    searchParamsState.draft = "stale-or-published-id";
    supabaseLoadResult.current = { data: null }; // wrong owner/status/doesn't exist

    const { result } = renderHook(() => useDraftManager());

    await waitFor(() => expect(result.current.loadingDraft).toBe(false));
    expect(result.current.loadError).toMatch(/could not be opened/i);

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

  it("switches the canonical save target when the route draft changes", async () => {
    searchParamsState.draft = "draft-1";
    supabaseLoadResult.current = {
      data: {
        title: "First route draft",
        excerpt: "",
        content: "<p>First</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };

    const { result, rerender } = renderHook(() =>
      useDraftManager({ userId: "user-1" })
    );
    await waitFor(() =>
      expect(result.current.initialData?.title).toBe("First route draft")
    );
    const firstSessionKey = result.current.editorSessionKey;

    searchParamsState.draft = "draft-2";
    supabaseLoadResult.current = {
      data: {
        title: "Second route draft",
        excerpt: "",
        content: "<p>Second</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };
    rerender();

    await waitFor(() =>
      expect(result.current.initialData?.title).toBe("Second route draft")
    );
    expect(result.current.editorSessionKey).not.toBe(firstSessionKey);
    expect(result.current.loadedDraftId).toBe("draft-2");

    await act(async () => {
      await result.current.flushDraft(
        baseDraftData({ title: "Second route draft, edited" })
      );
    });
    expect(ensureDraftMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draftId: "draft-2",
        title: "Second route draft, edited",
      })
    );
  });

  it("does not let an old in-flight save reclaim the editor after route navigation", async () => {
    searchParamsState.draft = "draft-1";
    supabaseLoadResult.current = {
      data: {
        title: "First route draft",
        excerpt: "",
        content: "<p>First</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };

    let resolveOldSave:
      | ((value: { error: null; draftId: string }) => void)
      | null = null;
    ensureDraftMock.mockImplementationOnce(
      () =>
        new Promise<{ error: null; draftId: string }>((resolve) => {
          resolveOldSave = resolve;
        })
    ).mockResolvedValueOnce({ error: null, draftId: "draft-2" });

    const { result, rerender } = renderHook(() =>
      useDraftManager({ userId: "user-1" })
    );
    await waitFor(() => expect(result.current.draftId).toBe("draft-1"));

    let oldFlush!: Promise<string | null>;
    act(() => {
      oldFlush = result.current.flushDraft(
        baseDraftData({ title: "First route draft, edited" })
      );
    });
    await waitFor(() => expect(ensureDraftMock).toHaveBeenCalledTimes(1));

    searchParamsState.draft = "draft-2";
    supabaseLoadResult.current = {
      data: {
        title: "Second route draft",
        excerpt: "",
        content: "<p>Second</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };
    rerender();
    await waitFor(() => expect(result.current.draftId).toBe("draft-2"));

    let newFlush!: Promise<string | null>;
    act(() => {
      newFlush = result.current.flushDraft(
        baseDraftData({ title: "Second route draft, edited" })
      );
    });
    // B must start without waiting for the deliberately unresolved A save.
    await waitFor(() => expect(ensureDraftMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      expect(await newFlush).toBe("draft-2");
      resolveOldSave?.({ error: null, draftId: "draft-1" });
      expect(await oldFlush).toBeNull();
    });

    expect(result.current.draftId).toBe("draft-2");
    expect(result.current.saveStatus).toBe("saved");
    expect(routerReplace).not.toHaveBeenCalled();
  });

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

  it("surfaces a different scoped device copy alongside a loaded server draft", async () => {
    searchParamsState.draft = "draft-1";
    localStorage.setItem(
      getDraftBackupStorageKey({ userId: "user-1", draftId: "draft-1" }),
      JSON.stringify(
        baseDraftData({
          title: "Device version",
          content: "<p>Recovered device changes</p>",
        })
      )
    );
    supabaseLoadResult.current = {
      data: {
        title: "Server version",
        excerpt: "",
        content: "<p>Server body</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };

    const { result } = renderHook(() =>
      useDraftManager({ userId: "user-1" })
    );

    await waitFor(() => expect(result.current.loadingBackup).toBe(false));
    expect(result.current.initialData?.title).toBe("Server version");
    expect(result.current.localBackup?.title).toBe("Device version");
  });

  it("flushes the newest snapshot immediately and cancels its pending debounce", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useDraftManager({ userId: "user-1", contextKey: "new" })
      );

      await act(async () => {
        await result.current.saveDraft(baseDraftData({ title: "Earlier" }));
      });

      let flushedId: string | null = null;
      await act(async () => {
        flushedId = await result.current.flushDraft(
          baseDraftData({ title: "Latest" })
        );
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(flushedId).toBe("server-assigned-id");
      expect(ensureDraftMock).toHaveBeenCalledTimes(1);
      expect(ensureDraftMock).toHaveBeenCalledWith(
        expect.objectContaining({ draftId: null, title: "Latest" })
      );
      expect(
        localStorage.getItem(
          getDraftBackupStorageKey({
            userId: "user-1",
            draftId: "server-assigned-id",
          })
        )
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("serializes concurrent flushes so only the first call can create the draft", async () => {
    let resolveFirstSave:
      | ((value: { error: null; draftId: string }) => void)
      | null = null;
    ensureDraftMock
      .mockImplementationOnce(
        () =>
          new Promise<{ error: null; draftId: string }>((resolve) => {
            resolveFirstSave = resolve;
          })
      )
      .mockResolvedValue({ error: null, draftId: "canonical-draft" });

    const { result } = renderHook(() =>
      useDraftManager({ userId: "user-1", contextKey: "new" })
    );

    let firstFlush!: Promise<string | null>;
    let secondFlush!: Promise<string | null>;
    act(() => {
      firstFlush = result.current.flushDraft(
        baseDraftData({ title: "First snapshot" })
      );
      secondFlush = result.current.flushDraft(
        baseDraftData({ title: "Second snapshot" })
      );
    });

    await waitFor(() => expect(ensureDraftMock).toHaveBeenCalledTimes(1));
    expect(ensureDraftMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ draftId: null })
    );

    await act(async () => {
      resolveFirstSave?.({ error: null, draftId: "canonical-draft" });
      await firstFlush;
      await secondFlush;
    });

    expect(ensureDraftMock).toHaveBeenCalledTimes(2);
    expect(ensureDraftMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        draftId: "canonical-draft",
        title: "Second snapshot",
      })
    );
    expect(result.current.draftId).toBe("canonical-draft");
  });

  it("cancels a pending debounced server write when the editor unmounts", async () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() =>
        useDraftManager({ userId: "user-1", contextKey: "new" })
      );

      await act(async () => {
        await result.current.saveDraft(baseDraftData());
      });
      unmount();

      await vi.advanceTimersByTimeAsync(4000);
      expect(ensureDraftMock).not.toHaveBeenCalled();
      const stored = JSON.parse(
        localStorage.getItem(
          getDraftBackupStorageKey({ userId: "user-1", contextKey: "new" })
        ) ?? "null"
      ) as { data?: { title?: string } } | null;
      expect(stored?.data?.title).toBe("A real title");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a legacy backup before assigning it to the account, then migrates it on Restore", async () => {
    localStorage.setItem(
      "indegenius_draft_backup",
      JSON.stringify(baseDraftData({ title: "Recovered safely" }))
    );

    const { result } = renderHook(() =>
      useDraftManager({ userId: "user-1", contextKey: "new" })
    );

    await waitFor(() =>
      expect(result.current.localBackup?.title).toBe("Recovered safely")
    );
    expect(result.current.loadingBackup).toBe(false);

    const scopedKey = getDraftBackupStorageKey({
      userId: "user-1",
      contextKey: "new",
    });
    expect(localStorage.getItem(scopedKey)).toBeNull();
    expect(localStorage.getItem("indegenius_draft_backup")).not.toBeNull();

    act(() => result.current.restoreFromBackup());

    const stored = JSON.parse(localStorage.getItem(scopedKey) ?? "null") as {
      version?: number;
      savedAt?: string;
      data?: { title?: string };
    } | null;

    expect(stored?.version).toBe(2);
    expect(stored?.savedAt).toEqual(expect.any(String));
    expect(stored?.data?.title).toBe("Recovered safely");
    expect(localStorage.getItem("indegenius_draft_backup")).toBeNull();
    expect(localStorage.getItem("thinkafrica_draft_backup")).toBeNull();
  });

  it("keeps body-only work in scoped recovery without sending an invalid server draft", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useDraftManager({ userId: "user-1", contextKey: "response:parent-1" })
      );

      await act(async () => {
        await result.current.saveDraft(
          baseDraftData({ title: "", content: "<p>Important unfinished idea</p>" })
        );
      });

      const scopedKey = getDraftBackupStorageKey({
        userId: "user-1",
        contextKey: "response:parent-1",
      });
      expect(localStorage.getItem(scopedKey)).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });
      const stored = JSON.parse(localStorage.getItem(scopedKey) ?? "null") as {
        data?: { content?: string };
      } | null;

      expect(stored?.data?.content).toContain("Important unfinished idea");
      expect(ensureDraftMock).not.toHaveBeenCalled();

      act(() => result.current.clearLocalBackup());
      expect(localStorage.getItem(scopedKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reset the editor session when a new draft URL acknowledges its canonical id", async () => {
    const { result, rerender } = renderHook(() =>
      useDraftManager({ userId: "user-1", contextKey: "new" })
    );
    const initialSessionKey = result.current.editorSessionKey;

    await act(async () => {
      expect(await result.current.flushDraft(baseDraftData())).toBe(
        "server-assigned-id"
      );
    });

    searchParamsState.draft = "server-assigned-id";
    rerender();

    await waitFor(() => expect(result.current.loadingDraft).toBe(false));
    expect(result.current.editorSessionKey).toBe(initialSessionKey);
    expect(result.current.draftId).toBe("server-assigned-id");
    expect(result.current.loadedDraftId).toBeNull();
  });

  it("clears the in-memory snapshot when an existing draft navigates to a new Article", async () => {
    searchParamsState.draft = "draft-1";
    supabaseLoadResult.current = {
      data: {
        title: "Draft one",
        excerpt: "",
        content: "<p>Draft one body</p>",
        tags: [],
        type: "essay",
        content_kind: "article",
        article_format: null,
        cover_image_url: null,
        in_response_to: null,
      },
    };
    const { result, rerender } = renderHook(() =>
      useDraftManager({ userId: "user-1" })
    );
    await waitFor(() => expect(result.current.loadedDraftId).toBe("draft-1"));
    const firstSessionKey = result.current.editorSessionKey;

    searchParamsState.draft = null;
    rerender();

    await waitFor(() => expect(result.current.draftId).toBeNull());
    expect(result.current.editorSessionKey).not.toBe(firstSessionKey);
    expect(result.current.initialData).toBeNull();
    expect(result.current.loadedDraftId).toBeNull();
    await act(async () => {
      expect(await result.current.flushDraft()).toBeNull();
    });
    expect(ensureDraftMock).not.toHaveBeenCalled();
  });

  it("scopes a pending legacy recovery to the identity that displayed it", async () => {
    localStorage.setItem(
      "indegenius_draft_backup",
      JSON.stringify(baseDraftData({ title: "Standalone legacy work" }))
    );
    const { result, rerender } = renderHook(() =>
      useDraftManager({ userId: "user-1" })
    );
    await waitFor(() =>
      expect(result.current.localBackup?.title).toBe("Standalone legacy work")
    );
    const firstSessionKey = result.current.editorSessionKey;

    searchParamsState.inResponseTo = "parent-2";
    rerender();
    await waitFor(() => expect(result.current.loadingBackup).toBe(false));

    expect(result.current.editorSessionKey).not.toBe(firstSessionKey);
    expect(result.current.localBackup).toBeNull();
    act(() => result.current.clearLocalBackup());
    expect(localStorage.getItem("indegenius_draft_backup")).not.toBeNull();
  });

  it("coalesces device writes and flushes the latest snapshot on pagehide", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() =>
        useDraftManager({ userId: "user-1", contextKey: "new" })
      );
      const scopedKey = getDraftBackupStorageKey({
        userId: "user-1",
        contextKey: "new",
      });

      await act(async () => {
        await result.current.saveDraft(
          baseDraftData({ title: "", content: "<p>One</p>" })
        );
        await result.current.saveDraft(
          baseDraftData({ title: "", content: "<p>Two</p>" })
        );
        await result.current.saveDraft(
          baseDraftData({ title: "", content: "<p>Final</p>" })
        );
      });
      await vi.advanceTimersByTimeAsync(349);
      expect(localStorage.getItem(scopedKey)).toBeNull();

      act(() => window.dispatchEvent(new Event("pagehide")));
      const stored = JSON.parse(localStorage.getItem(scopedKey) ?? "null") as {
        data?: { content?: string };
      } | null;
      expect(stored?.data?.content).toBe("<p>Final</p>");

      await vi.advanceTimersByTimeAsync(1000);
      const afterTimers = JSON.parse(
        localStorage.getItem(scopedKey) ?? "null"
      ) as { data?: { content?: string } } | null;
      expect(afterTimers?.data?.content).toBe("<p>Final</p>");
    } finally {
      vi.useRealTimers();
    }
  });
});
