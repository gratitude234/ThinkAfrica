import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UniversalComposer from "./UniversalComposer";
import type { ContributionSnapshot } from "@/lib/contribution";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  ensure: vi.fn(),
  publish: vi.fn(),
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
    localStorage.clear();
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
