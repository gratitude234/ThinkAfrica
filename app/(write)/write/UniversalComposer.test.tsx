import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useEffect, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UniversalComposer from "./UniversalComposer";
import type { ContributionSnapshot } from "@/lib/contribution";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  ensure: vi.fn(),
  publish: vi.fn(),
  editorMounts: { count: 0 },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    forwardRef(function MockEditor(
      props: { content: string; placeholder: string; ariaLabel: string; onUpdate: (value: string) => void },
      ref
    ) {
      useImperativeHandle(ref, () => ({
        toggleBold: vi.fn(), toggleItalic: vi.fn(), toggleH2: vi.fn(), toggleBulletList: vi.fn(),
        toggleOrderedList: vi.fn(), toggleBlockquote: vi.fn(), isActive: () => false,
        undo: vi.fn(), redo: vi.fn(), triggerImageUpload: vi.fn(), insertLink: vi.fn(), insertCitation: vi.fn(),
      }));
      // A remount is what costs the writer their caret, focus and undo history,
      // so the tests below count mounts rather than renders.
      useEffect(() => { mocks.editorMounts.count += 1; }, []);
      return <textarea aria-label={props.ariaLabel} placeholder={props.placeholder} value={props.content} onChange={(event) => props.onUpdate(event.target.value)} />;
    }),
}));

vi.mock("./actions", () => ({
  ensureContributionDraft: (input: unknown) => mocks.ensure(input),
  publishContribution: (input: unknown) => mocks.publish(input),
}));
vi.mock("./editActions", () => ({
  savePublishedEditDraft: vi.fn(), applyPublishedEditDraft: vi.fn(), discardPublishedEditDraft: vi.fn(),
}));
vi.mock("@/components/ui/CoverImageUploader", () => ({ default: () => <button type="button">Add cover</button> }));
vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));
vi.mock("@/components/post/ReferencesPanel", () => ({ default: () => <div>Sources panel</div> }));
vi.mock("@/components/collaboration/CoAuthorPicker", () => ({ default: () => <div>Collaborators panel</div> }));
vi.mock("./MyDrafts", () => ({ default: () => <div>Drafts panel</div> }));
vi.mock("@/components/ui/ProfileGate", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <div role="img" aria-label={props.alt} /> }));

const empty: ContributionSnapshot = {
  title: "", content: "", excerpt: "", tags: [], coverImageUrl: "", references: [],
  collaborators: [], inResponseToId: null, promptId: null,
};

describe("UniversalComposer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.ensure.mockReset().mockResolvedValue({ error: null, draftId: "draft-1" });
    mocks.publish.mockReset().mockResolvedValue({ error: null, slug: "hello" });
    mocks.editorMounts.count = 0;
    localStorage.clear();
    window.history.replaceState(null, "", "/write");
  });

  afterEach(() => vi.useRealTimers());

  it("starts body-first with an optional title and no format choice", () => {
    render(<UniversalComposer mode="new" userId="user-1" profile={{ full_name: "Ada", username: "ada", university: null }} initialSnapshot={empty} returnTo="/" />);
    expect(screen.getByPlaceholderText("Start writing…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.queryByText(/Posts are public|Write an article|Article composer/i)).not.toBeInTheDocument();
  });

  it("cloud-saves untitled body text and opens one compact publish preview", async () => {
    render(<UniversalComposer mode="new" userId="user-1" profile={{ full_name: "Ada", username: "ada", university: null }} initialSnapshot={empty} returnTo="/" />);
    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>A body-first idea.</p>" } });

    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mocks.ensure).toHaveBeenCalled();
    expect(mocks.ensure.mock.calls[0][0].snapshot.title).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByRole("dialog", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish now" })).toBeInTheDocument();
    expect(screen.getByText(/Topics/)).toBeInTheDocument();
    expect(screen.getByText(/Cover/)).toBeInTheDocument();
  });

  it("adds a title without leaving the same canvas", () => {
    render(<UniversalComposer mode="new" userId="user-1" profile={{ full_name: "Ada", username: "ada", university: null }} initialSnapshot={empty} returnTo="/" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add title" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "One continuous workflow" } });
    expect(screen.getByDisplayValue("One continuous workflow")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Start writing…")).toBeInTheDocument();
  });
});

describe("UniversalComposer autosave and recovery", () => {
  const profile = { full_name: "Ada", username: "ada", university: null };

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.ensure.mockReset().mockResolvedValue({ error: null, draftId: "draft-1" });
    mocks.publish.mockReset().mockResolvedValue({ error: null, slug: "hello" });
    mocks.editorMounts.count = 0;
    localStorage.clear();
    window.history.replaceState(null, "", "/write");
  });

  afterEach(() => vi.useRealTimers());

  it("keeps the writer's caret when the first autosave claims a draft id", async () => {
    render(
      <UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={empty} returnTo="/" />
    );
    expect(mocks.editorMounts.count).toBe(1);

    fireEvent.change(screen.getByLabelText("Publication body"), {
      target: { value: "<p>Mid sentence and still typin" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(mocks.ensure).toHaveBeenCalled();
    // The address updates so a refresh finds the draft, but shallowly: a server
    // re-render here would remount the editor under the cursor.
    expect(window.location.search).toContain("draft=draft-1");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.editorMounts.count).toBe(1);
  });

  it("does not remount when the page re-renders with the draft it just saved", async () => {
    const { rerender } = render(
      <UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={empty} draftId={null} returnTo="/" />
    );
    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Still going</p>" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={empty} draftId="draft-1" returnTo="/" />
    );

    expect(mocks.editorMounts.count).toBe(1);
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>Still going</p>");
  });

  it("rebuilds the canvas around a genuinely different draft", async () => {
    const first: ContributionSnapshot = { ...empty, content: "<p>The first draft.</p>" };
    const second: ContributionSnapshot = { ...empty, title: "The second", content: "<p>The second draft.</p>" };
    const { rerender } = render(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={first} draftId="draft-1" returnTo="/" />
    );
    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>The first draft.</p>");

    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={second} draftId="draft-2" returnTo="/" />
    );

    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>The second draft.</p>");
    expect(screen.getByDisplayValue("The second")).toBeInTheDocument();
    expect(mocks.editorMounts.count).toBe(2);
  });

  it("continues autosaving the resumed draft, not the one left behind", async () => {
    const first: ContributionSnapshot = { ...empty, content: "<p>The first draft.</p>" };
    const second: ContributionSnapshot = { ...empty, content: "<p>The second draft.</p>" };
    const { rerender } = render(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={first} draftId="draft-1" returnTo="/" />
    );
    rerender(
      <UniversalComposer mode="draft" userId="user-1" profile={profile} initialSnapshot={second} draftId="draft-2" returnTo="/" />
    );

    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>An addition.</p>" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });

    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ draftId: "draft-2" }));
  });

  it("clears the key a recovered copy came from, so discarding sticks", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { content: "<p>Writing from the old composer.</p>" } })
    );
    const { unmount } = render(
      <UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={empty} returnTo="/" />
    );
    expect(screen.getByText(/unsaved copy/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();

    unmount();
    render(<UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={empty} returnTo="/" />);
    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
  });

  it("restores from a legacy key without leaving it behind to offer again", () => {
    localStorage.setItem(
      "indegenius:post-draft:user-1",
      JSON.stringify({ data: { content: "<p>Writing from the old composer.</p>" } })
    );
    render(<UniversalComposer mode="new" userId="user-1" profile={profile} initialSnapshot={empty} returnTo="/" />);

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(screen.getByLabelText("Publication body")).toHaveValue("<p>Writing from the old composer.</p>");
    expect(localStorage.getItem("indegenius:post-draft:user-1")).toBeNull();
  });

  it("does not offer a device copy the account copy already supersedes", () => {
    localStorage.setItem(
      "indegenius:contribution-draft:v1:user-1:draft:draft-1",
      JSON.stringify({ savedAt: "2026-08-23T10:00:00.000Z", data: { content: "<p>An older thought.</p>" } })
    );
    render(
      <UniversalComposer
        mode="draft"
        userId="user-1"
        profile={profile}
        initialSnapshot={{ ...empty, content: "<p>The newer thought.</p>" }}
        draftId="draft-1"
        draftUpdatedAt="2026-08-23T11:00:00.000Z"
        returnTo="/"
      />
    );

    expect(screen.queryByText(/unsaved copy/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("indegenius:contribution-draft:v1:user-1:draft:draft-1")).toBeNull();
  });

  it("still offers a device copy written after the account copy", () => {
    localStorage.setItem(
      "indegenius:contribution-draft:v1:user-1:draft:draft-1",
      JSON.stringify({ savedAt: "2026-08-23T12:00:00.000Z", data: { content: "<p>Work that never reached the server.</p>" } })
    );
    render(
      <UniversalComposer
        mode="draft"
        userId="user-1"
        profile={profile}
        initialSnapshot={{ ...empty, content: "<p>The older thought.</p>" }}
        draftId="draft-1"
        draftUpdatedAt="2026-08-23T11:00:00.000Z"
        returnTo="/"
      />
    );

    expect(screen.getByText(/unsaved copy/i)).toBeInTheDocument();
  });
});
