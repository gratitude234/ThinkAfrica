import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import { editorMock, resetEditorMock } from "@/lib/testUtils/mockEditor";
import UniversalComposer from "./UniversalComposer";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  ensure: vi.fn(),
  publish: vi.fn(),
  deleteDrafts: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
vi.mock("./actions", () => ({
  ensureContributionDraft: (input: unknown) => mocks.ensure(input),
  publishContribution: (input: unknown) => mocks.publish(input),
}));
vi.mock("./editActions", () => ({
  savePublishedEditDraft: vi.fn(),
  applyPublishedEditDraft: vi.fn(),
  discardPublishedEditDraft: vi.fn(),
}));
vi.mock("./deleteActions", () => ({
  deleteOwnDraftPosts: (input: unknown) => mocks.deleteDrafts(input),
}));
vi.mock("@/lib/uploadImage", () => ({ uploadImage: (file: File) => mocks.upload(file) }));
vi.mock("@/components/ui/CoverImageUploader", () => ({
  default: ({ emptyTitle, initialUrl }: { emptyTitle?: string; initialUrl?: string }) => (
    <button type="button">{initialUrl ? `Cover ${initialUrl}` : emptyTitle}</button>
  ),
}));
vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));
vi.mock("@/components/ui/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/post/ReferencesPanel", () => ({ default: () => <div>Sources panel</div> }));
vi.mock("./RevisionHistory", () => ({ default: () => <div>History panel</div> }));
vi.mock("@/components/ui/ProfileGate", () => ({
  default: ({
    onComplete,
  }: {
    onComplete: (profile: { full_name: string; username: string; university: null }) => void;
  }) => (
    <button type="button" onClick={() => onComplete({ full_name: "Ada", username: "ada", university: null })}>
      Finish profile
    </button>
  ),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div role="img" aria-label={props.alt} />,
}));

const empty: ContributionSnapshot = {
  title: "", content: "", excerpt: "", tags: [], coverImageUrl: "", references: [],
};
const profile = { full_name: "Ada", username: "ada", university: null, avatar_url: null };

function open(snapshot: ContributionSnapshot = empty, props: Record<string, unknown> = {}) {
  return render(
    <UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={snapshot} returnTo="/" {...props} />
  );
}

async function type(value: string) {
  fireEvent.change(screen.getByLabelText("Publication body"), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.ensure.mockResolvedValue({ error: null, draftId: "draft-1" });
  mocks.publish.mockResolvedValue({ error: null, slug: "hello" });
  mocks.deleteDrafts.mockResolvedValue({ ok: true, data: { deleted: ["draft-1"], refusedCount: 0 } });
  resetEditorMock();
  localStorage.clear();
  window.history.replaceState(null, "", "/write");
});

afterEach(() => vi.useRealTimers());

describe("choosing the screen", () => {
  it("opens an untitled new piece in the Post composer", () => {
    open();

    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Share an idea, a link, a moment.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("opens the Article editor when asked", () => {
    open(empty, { initialSurface: "article" });

    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Tell your story.")).toBeInTheDocument();
  });

  it("opens a titled draft in the Article editor, even when asked for a Post", () => {
    open({ ...empty, title: "A title", content: "<p>Body.</p>" }, { mode: "draft", draftId: "draft-1", initialSurface: "post" });

    expect(screen.getByLabelText("Title")).toHaveValue("A title");
  });

  it("switches to the Article editor with the writing, and keeps it in the address", async () => {
    open();
    await type("<p>A thought that grew into something longer.</p>");

    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));

    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>A thought that grew into something longer.</p>");
    expect(window.location.search).toContain("draft=draft-1");
    expect(window.location.search).toContain("editor=article");
  });

  it("goes back to the Post composer while the Article is still untitled", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();
    expect(window.location.search).not.toContain("editor");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("leaves from Back once the Article has a title", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A title" } });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("never shows the Post composer over a title", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { title: "Recovered title", content: "<p>Recovered writing from this device.</p>" } })
    );
    open();
    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByLabelText("Title")).toHaveValue("Recovered title");
    expect(window.location.search).toContain("editor=article");
  });

  it("carries a Post's image to the Article's cover and back", () => {
    open({ ...empty, content: "<p>A photo worth a post.</p>", coverImageUrl: "https://cdn.example/photo.png" });
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Article/ }));
    expect(screen.getByText("Cover https://cdn.example/photo.png")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Remove image" })).toBeInTheDocument();
  });

  it("edits a published Post in the Post composer, full screen", () => {
    const { container } = open(
      { ...empty, content: "<p>Already out there.</p>" },
      { mode: "published-edit", publishedPostId: "post-1", publishedSlug: "hello", returnTo: "/post/hello" }
    );

    expect(screen.getByRole("heading", { name: "Edit post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("fixed", "inset-0");
  });
});

describe("publishing", () => {
  it("publishes a Post straight from its button", async () => {
    open();
    await type("<p>A thought worth sharing today.</p>");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Post" })); });

    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ title: "" }) })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith("/post/hello?justPublished=1");
  });

  it("takes an Article through Publish settings", async () => {
    open(empty, { initialSurface: "article" });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Power to the people" } });
    await type("<p>Solar microgrids are changing Jos.</p>");

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = screen.getByRole("dialog", { name: "Publish settings" });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Publish" })); });

    expect(mocks.publish).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot: expect.objectContaining({ title: "Power to the people" }) })
    );
  });

  it("asks for a name first, then carries on publishing", async () => {
    open(empty, { profile: { full_name: null, username: null, university: null, avatar_url: null } });
    await type("<p>A thought worth sharing today.</p>");

    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(mocks.publish).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Finish profile" })); });
    expect(mocks.publish).toHaveBeenCalled();
  });
});

describe("discarding", () => {
  it("confirms, then deletes a saved draft", async () => {
    open({ ...empty, content: "<p>A draft that is no longer wanted.</p>" }, { mode: "draft", draftId: "draft-1" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard" }));
    const dialog = screen.getByRole("alertdialog", { name: "Discard this draft?" });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Discard" })); });

    expect(mocks.deleteDrafts).toHaveBeenCalledWith({ postIds: ["draft-1"] });
    expect(mocks.push).toHaveBeenCalledWith("/");
  });
});

describe("autosave and recovery", () => {
  it("keeps the writer's caret when the first autosave claims a draft id", async () => {
    open();
    expect(editorMock.mounts).toBe(1);

    fireEvent.change(screen.getByLabelText("Publication body"), {
      target: { value: "<p>Mid sentence and still typin" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(mocks.ensure).toHaveBeenCalled();
    // The address updates so a refresh finds the draft, but shallowly: a server
    // re-render here would remount the editor under the cursor.
    expect(window.location.search).toContain("draft=draft-1");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(editorMock.mounts).toBe(1);
  });

  it("does not remount when the page re-renders with the draft it just saved", async () => {
    const { rerender } = open(empty, { draftId: null });
    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Still going and still writing here.</p>" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={empty} draftId="draft-1" returnTo="/" />
    );

    expect(editorMock.mounts).toBe(1);
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>Still going and still writing here.</p>");
  });

  it("rebuilds the canvas around a genuinely different draft", () => {
    const first: ContributionSnapshot = { ...empty, content: "<p>The first draft.</p>" };
    const second: ContributionSnapshot = { ...empty, title: "The second", content: "<p>The second draft.</p>" };
    const { rerender } = open(first, { mode: "draft", draftId: "draft-1" });
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>The first draft.</p>");

    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={second} draftId="draft-2" returnTo="/" />
    );

    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>The second draft.</p>");
    expect(screen.getByDisplayValue("The second")).toBeInTheDocument();
    expect(editorMock.mounts).toBe(2);
  });

  it("continues autosaving the resumed draft, not the one left behind", async () => {
    const first: ContributionSnapshot = { ...empty, content: "<p>The first draft.</p>" };
    const second: ContributionSnapshot = { ...empty, content: "<p>The second draft.</p>" };
    const { rerender } = open(first, { mode: "draft", draftId: "draft-1" });
    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={second} draftId="draft-2" returnTo="/" />
    );

    await type("<p>An addition worth saving to the draft.</p>");

    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ draftId: "draft-2" }));
  });

  it("clears the key a recovered copy came from, so discarding sticks", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { content: "<p>Writing from the old composer.</p>" } })
    );
    const { unmount } = open();
    expect(screen.getByText(/unsaved copy/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();

    unmount();
    open();
    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
  });

  it("restores from a legacy key without leaving it behind to offer again", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { content: "<p>Writing from the old composer.</p>" } })
    );
    open();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>Writing from the old composer.</p>");
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();
  });

  it("does not offer a device copy the account copy already supersedes", () => {
    localStorage.setItem(
      "indegenius:contribution-draft:v1:user-1:draft:draft-1",
      JSON.stringify({ savedAt: "2026-08-23T10:00:00.000Z", data: { content: "<p>An older thought.</p>" } })
    );
    open(
      { ...empty, content: "<p>The newer thought.</p>" },
      { mode: "draft", draftId: "draft-1", draftUpdatedAt: "2026-08-23T11:00:00.000Z" }
    );

    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:draft:draft-1")).toBeNull();
  });

  it("still offers a device copy written after the account copy", () => {
    localStorage.setItem(
      "indegenius:contribution-draft:v1:user-1:draft:draft-1",
      JSON.stringify({ savedAt: "2026-08-23T12:00:00.000Z", data: { content: "<p>Work that never reached the server.</p>" } })
    );
    open(
      { ...empty, content: "<p>The older thought.</p>" },
      { mode: "draft", draftId: "draft-1", draftUpdatedAt: "2026-08-23T11:00:00.000Z" }
    );

    expect(screen.getByText(/unsaved copy/i)).toBeInTheDocument();
  });
});

describe("draft hygiene", () => {
  it("does not mint a database row for a stray keystroke", async () => {
    open();
    await type("<p>Ghhbh</p>");

    expect(mocks.ensure).not.toHaveBeenCalled();
    // The device still holds it, so nothing typed is ever lost.
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:new:new")).not.toBeNull();
  });

  it("saves to the account once there is about a sentence", async () => {
    open();
    await type("<p>Solar microgrids are changing Jos.</p>");

    expect(mocks.ensure).toHaveBeenCalled();
  });

  it("saves immediately once a title exists, however short the body", async () => {
    open(empty, { initialSurface: "article" });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A real intent" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(mocks.ensure).toHaveBeenCalled();
  });

  it("leaves without a save warning when the writing never earned a row", async () => {
    open();
    await type("<p>Gh</p>");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });

    expect(screen.queryByText(/didn’t save/)).not.toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("does not interrupt a later visit over a device copy too small to matter", () => {
    localStorage.setItem("indegenius:post-draft:user-1", JSON.stringify({ data: { content: "<p>Gh</p>" } }));
    open();

    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();
  });
});

describe("the screen", () => {
  it("keeps the canvas to this piece, and leaves managing drafts to the profile", () => {
    open();

    expect(screen.queryByRole("heading", { name: /drafts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /drafts/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Continue where you left off/i)).not.toBeInTheDocument();
  });

  it("says Saving while the account copy is on its way, then Draft saved", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Something worth saving to the account.</p>" } });

    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(screen.queryByText(/this device/)).not.toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(screen.getByText("Draft saved")).toBeInTheDocument();
  });
});
