import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import { useContributionDraft, type ContributionDraftOptions } from "./useContributionDraft";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  ensure: vi.fn(),
  publish: vi.fn(),
  saveEdit: vi.fn(),
  applyEdit: vi.fn(),
  discardEdit: vi.fn(),
  deleteDrafts: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock("./actions", () => ({
  ensureContributionDraft: (input: unknown) => mocks.ensure(input),
  publishContribution: (input: unknown) => mocks.publish(input),
}));
vi.mock("./editActions", () => ({
  savePublishedEditDraft: (input: unknown) => mocks.saveEdit(input),
  applyPublishedEditDraft: (input: unknown) => mocks.applyEdit(input),
  discardPublishedEditDraft: (input: unknown) => mocks.discardEdit(input),
}));
vi.mock("./deleteActions", () => ({
  deleteOwnDraftPosts: (input: unknown) => mocks.deleteDrafts(input),
}));

const empty: ContributionSnapshot = {
  title: "", content: "", excerpt: "", tags: [], coverImageUrl: "", references: [],
};
const written: ContributionSnapshot = {
  ...empty,
  content: "<p>A paragraph that is long enough to keep.</p>",
};

function open(options: Partial<ContributionDraftOptions> = {}) {
  return renderHook(() =>
    useContributionDraft({
      mode: "new",
      userId: "user-1",
      initialSnapshot: empty,
      returnTo: "/",
      ...options,
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.ensure.mockResolvedValue({ error: null, draftId: "draft-1" });
  mocks.publish.mockResolvedValue({ error: null, slug: "hello" });
  mocks.discardEdit.mockResolvedValue({ error: null });
  mocks.deleteDrafts.mockResolvedValue({ ok: true, data: { deleted: ["draft-1"], refusedCount: 0 } });
  localStorage.clear();
  window.history.replaceState(null, "", "/write");
});

afterEach(() => vi.useRealTimers());

describe("saving on request", () => {
  it("saves a short piece when the writer asks, below the autosave minimum", async () => {
    const { result } = open();
    act(() => result.current.setSnapshot({ ...empty, content: "<p>Short.</p>" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mocks.ensure).not.toHaveBeenCalled();

    let saved = false;
    await act(async () => { saved = await result.current.flush({ force: true }); });

    expect(saved).toBe(true);
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
    expect(result.current.draftId).toBe("draft-1");
  });

  it("has nothing to save when nothing is written", async () => {
    const { result } = open();

    let saved = false;
    await act(async () => { saved = await result.current.flush({ force: true }); });

    expect(saved).toBe(true);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});

describe("leaving", () => {
  it("leaves for the drafts list through the same save as Close", async () => {
    const { result } = open();
    act(() => result.current.setSnapshot(written));

    await act(async () => { await result.current.requestClose("/ada?tab=drafts"); });

    expect(mocks.ensure).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/ada?tab=drafts");
  });

  it("leaves with the device copy for the place the writer was going", async () => {
    mocks.ensure.mockResolvedValue({ error: "Network down", draftId: null });
    const { result } = open({ initialSnapshot: written });
    act(() => result.current.setSnapshot({ ...written, content: "<p>An edit that will not reach the server.</p>" }));

    await act(async () => { await result.current.requestClose("/ada?tab=drafts"); });
    expect(result.current.showLeave).toBe(true);

    act(() => result.current.navigateAway());
    expect(mocks.push).toHaveBeenCalledWith("/ada?tab=drafts");
  });
});

describe("discarding", () => {
  const LOCAL_KEY = "indegenius:contribution-draft:v1:user-1:draft:draft-1";

  it("deletes a saved draft, forgets the device copy and leaves", async () => {
    const { result } = open({ mode: "draft", draftId: "draft-1", initialSnapshot: written });
    localStorage.setItem(LOCAL_KEY, "{}");

    let discarded = false;
    await act(async () => { discarded = await result.current.discardDraft(); });

    expect(discarded).toBe(true);
    expect(mocks.deleteDrafts).toHaveBeenCalledWith({ postIds: ["draft-1"] });
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("deletes the draft a save in flight is creating, and saves nothing after", async () => {
    let finishSave: (value: { error: null; draftId: string }) => void = () => {};
    mocks.ensure.mockImplementationOnce(
      () => new Promise((resolve) => { finishSave = resolve; })
    );
    const { result } = open();
    act(() => result.current.setSnapshot(written));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);

    let discarding: Promise<boolean> = Promise.resolve(false);
    act(() => { discarding = result.current.discardDraft(); });
    await act(async () => {
      finishSave({ error: null, draftId: "draft-1" });
      await discarding;
    });

    expect(mocks.deleteDrafts).toHaveBeenCalledWith({ postIds: ["draft-1"] });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.ensure).toHaveBeenCalledTimes(1);
  });

  it("cancels an autosave that has not started yet", async () => {
    const { result } = open();
    act(() => result.current.setSnapshot(written));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

    await act(async () => { await result.current.discardDraft(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.deleteDrafts).not.toHaveBeenCalled();
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:new:new")).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("keeps the draft and says why when the delete fails", async () => {
    mocks.deleteDrafts.mockResolvedValue({ ok: false, error: "We couldn't delete this draft." });
    const { result } = open({ mode: "draft", draftId: "draft-1", initialSnapshot: written });

    let discarded = true;
    await act(async () => { discarded = await result.current.discardDraft(); });

    expect(discarded).toBe(false);
    expect(result.current.saveLabel).toBe("We couldn't delete this draft.");
    expect(result.current.discarding).toBe(false);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("discards a published edit and returns to the live post", async () => {
    const { result } = open({
      mode: "published-edit",
      publishedPostId: "post-1",
      publishedSlug: "hello",
      editDraftId: "edit-1",
      initialSnapshot: written,
      returnTo: "/post/hello",
    });

    await act(async () => { await result.current.discardDraft(); });

    expect(mocks.discardEdit).toHaveBeenCalledWith({ editDraftId: "edit-1" });
    expect(mocks.deleteDrafts).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/post/hello");
  });

  it("returns to the live post when there was no edit to discard", async () => {
    const { result } = open({
      mode: "published-edit",
      publishedPostId: "post-1",
      publishedSlug: "hello",
      initialSnapshot: written,
      returnTo: "/post/hello",
    });

    await act(async () => { await result.current.discardDraft(); });

    expect(mocks.discardEdit).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/post/hello");
  });
});

describe("publishing", () => {
  it("reports a failed publish apart from the save state", async () => {
    mocks.publish.mockResolvedValue({ error: "Add a title.", slug: null });
    const { result } = open({ initialSnapshot: written });

    await act(async () => { await result.current.publish(); });

    expect(result.current.publishError).toBe("Add a title.");
    expect(result.current.saveState).not.toBe("error");
    expect(result.current.publishing).toBe(false);
  });
});

describe("the save status", () => {
  it("says nothing on an empty page, even after the writer clears what they typed", async () => {
    const { result } = open();
    expect(result.current.saveLabel).toBe("");

    // An editor emptied by hand holds an empty paragraph, not nothing, so the
    // device copy is still written.
    act(() => result.current.setSnapshot({ ...empty, content: "<p></p>" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(result.current.saveState).toBe("device");
    expect(result.current.saveLabel).toBe("");
  });

  it("claims no save for writing too short to make an account draft", async () => {
    const { result } = open();

    act(() => result.current.setSnapshot({ ...empty, content: "<p>Short.</p>" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });

    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(result.current.saveLabel).toBe("");
  });

  it("says Saving while the account copy is on its way, then Draft saved", async () => {
    const { result } = open();

    act(() => result.current.setSnapshot(written));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.saveLabel).toBe("Saving…");

    await act(async () => { await vi.advanceTimersByTimeAsync(1700); });
    expect(result.current.saveLabel).toBe("Draft saved");
  });

  it("says Changes saved for an edit to something published", async () => {
    const { result } = open({ mode: "published-edit", publishedPostId: "post-1", initialSnapshot: written, editDraftId: "edit-1" });

    expect(result.current.saveLabel).toBe("Changes saved");
  });

  it("mentions this device only when the account save failed", async () => {
    mocks.ensure.mockResolvedValue({ error: "We couldn't save this draft.", draftId: null });
    const { result } = open();

    act(() => result.current.setSnapshot(written));
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(result.current.saveState).toBe("error");
    expect(result.current.saveLabel).toBe("We couldn't save this draft. Kept on this device.");
  });
});
