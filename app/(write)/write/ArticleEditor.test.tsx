import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import type { PostReferenceRecord } from "@/lib/types";
import { emptySnapshot, fakeDraft } from "@/lib/testUtils/contributionDraft";
import { editorMock, resetEditorMock } from "@/lib/testUtils/mockEditor";
import type { ContributionDraft } from "./useContributionDraft";
import ArticleEditor, { type ArticleEditorProps } from "./ArticleEditor";

vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div role="img" aria-label={props.alt} />,
}));
vi.mock("@/components/ui/CoverImageUploader", () => ({
  default: ({ emptyTitle, initialUrl }: { emptyTitle?: string; initialUrl?: string }) => (
    <button type="button">{initialUrl ? `Cover ${initialUrl}` : emptyTitle}</button>
  ),
}));
vi.mock("@/components/ui/TagInput", () => ({ default: () => <input aria-label="Topics" /> }));
vi.mock("@/components/ui/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/post/ReferencesPanel", () => ({ default: () => <div>Sources panel</div> }));
vi.mock("./RevisionHistory", () => ({ default: () => <div>History panel</div> }));

function renderEditor(
  snapshot: Partial<ContributionSnapshot> = {},
  props: Partial<ArticleEditorProps> = {},
  draftOverrides: Partial<ContributionDraft> = {}
) {
  const draft = fakeDraft(snapshot, draftOverrides);
  const all: ArticleEditorProps = {
    draft,
    mode: "new",
    authorName: "Ada",
    avatarUrl: null,
    username: "ada",
    hasAppNav: true,
    autoFocusTitle: false,
    onBack: vi.fn(),
    onDiscard: vi.fn(),
    withCompleteProfile: vi.fn((next: () => void) => next()),
    ...props,
  };
  const view = render(<ArticleEditor {...all} />);
  return { draft, props: all, ...view };
}

const titled = { title: "Power to the people", content: "<p>Solar microgrids are changing Jos.</p>" };

describe("ArticleEditor", () => {
  beforeEach(() => resetEditorMock());

  it("is a titled page with a cover and a body", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Add cover" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("placeholder", "Title");
    expect(screen.getByLabelText("Publication body")).toHaveAttribute("placeholder", "Tell your story.");
    expect(screen.getByLabelText("Publication body")).toHaveAttribute("data-variant", "article");
  });

  it("shows a cover it already has", () => {
    renderEditor({ ...titled, coverImageUrl: "https://cdn.example/cover.png" });

    expect(screen.getByRole("button", { name: "Cover https://cdn.example/cover.png" })).toBeInTheDocument();
  });

  it("asks for a title once there is a body, and holds Continue until there is one", () => {
    const { props } = renderEditor({ content: "<p>A body with no title yet.</p>" });

    const message = screen.getByText("Add a title to continue. An Article needs one, a Post never does.");
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-describedby", message.id);
    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(continueButton);
    expect(screen.getByLabelText("Title")).toHaveFocus();
    expect(props.withCompleteProfile).not.toHaveBeenCalled();
  });

  it("holds Continue until there is a body, and says so when pressed", () => {
    const { props } = renderEditor({ title: "A title" });

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toHaveAttribute("aria-disabled", "true");
    expect(continueButton).toBeEnabled();
    expect(screen.queryByText(/Add a title to continue/)).not.toBeInTheDocument();

    fireEvent.click(continueButton);

    expect(screen.getByText("Write something here to continue.")).toBeInTheDocument();
    expect(editorMock.handle.focus).toHaveBeenCalled();
    expect(props.withCompleteProfile).not.toHaveBeenCalled();
  });

  it("names everything missing when Continue is pressed on an empty page", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Add a title to continue. An Article needs one, a Post never does.")).toBeInTheDocument();
    expect(screen.getByText("Write something here to continue.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveFocus();
  });

  it("says what Preview needs instead of opening an empty preview", () => {
    renderEditor({ title: "A title" });

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText("Write something here to preview it.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Reader preview" })).not.toBeInTheDocument();
  });

  it("goes on to Publish settings, then publishes", () => {
    const { draft, props } = renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(props.withCompleteProfile).toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Publish settings" })).getByRole("button", { name: "Publish" }));

    expect(draft.publish).toHaveBeenCalled();
  });

  it("says Update Article when editing something published", () => {
    renderEditor(titled, { mode: "published-edit" }, { editDraftId: "edit-1" });

    expect(screen.getByRole("button", { name: "Update Article" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("menuitem", { name: "Discard changes" })).toBeInTheDocument();
  });

  it("keeps sources and version history in the ••• menu", () => {
    const reference = { id: "ref-1", title: "A study" } as PostReferenceRecord;
    renderEditor({ ...titled, references: [reference] }, {}, { draftId: "draft-1" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sources, 1 added" }));
    expect(within(screen.getByRole("dialog", { name: "Sources" })).getByText("Sources panel")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Version history" }));
    expect(within(screen.getByRole("dialog", { name: "Version history" })).getByText("History panel")).toBeInTheDocument();
  });

  it("offers no version history when editing something published", () => {
    renderEditor(titled, { mode: "published-edit" });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menuitem", { name: "Version history" })).not.toBeInTheDocument();
  });

  it("saves a draft on request and leaves for the drafts list through the save", () => {
    const { draft } = renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Save draft" }));
    expect(draft.flush).toHaveBeenCalledWith({ force: true });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Drafts" }));
    expect(draft.requestClose).toHaveBeenCalledWith("/ada?tab=drafts");
  });

  it("shows the image details while an image is selected", () => {
    editorMock.selectedImage = { src: "https://example.com/chart.png", alt: "", caption: "" };
    renderEditor(titled);

    fireEvent.change(screen.getByLabelText("Publication body"), { target: { value: "<p>Body.</p>" } });
    fireEvent.change(screen.getByLabelText("Caption"), { target: { value: "Lagos, 2026" } });

    expect(editorMock.handle.updateSelectedImage).toHaveBeenCalledWith({ caption: "Lagos, 2026" });
  });

  it("reports an image upload in the save status", async () => {
    renderEditor(titled);

    await act(async () => {
      editorMock.props?.onImageUploadingChange?.(true);
    });

    expect(screen.getByText("Adding image…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("previews the piece as it reads", () => {
    renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("dialog", { name: "Reader preview" })).toBeInTheDocument();
  });

  it("shows the phone toolbar only while the body has focus", () => {
    renderEditor(titled);
    expect(screen.queryByRole("toolbar", { name: "Formatting" })).not.toBeInTheDocument();

    fireEvent.focus(screen.getByLabelText("Publication body"));
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("Publication body"));
    fireEvent.focus(screen.getByLabelText("Title"));
    expect(screen.queryByRole("toolbar", { name: "Formatting" })).not.toBeInTheDocument();
  });

  it("aligns text through the editor", () => {
    renderEditor(titled);

    fireEvent.focus(screen.getByLabelText("Publication body"));
    fireEvent.click(screen.getByRole("button", { name: "More formatting" }));
    fireEvent.click(screen.getByRole("button", { name: "Justify" }));

    expect(editorMock.handle.setTextAlign).toHaveBeenCalledWith("justify");
  });

  it("keeps a title to one line", () => {
    const { draft } = renderEditor();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Line one\nLine two" } });

    const update = (draft.setSnapshot as Mock).mock.calls[0][0] as (s: ContributionSnapshot) => ContributionSnapshot;
    expect(update(emptySnapshot).title).toBe("Line one Line two");
  });

  it("moves from the title to the body on Enter", () => {
    renderEditor();

    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Enter" });

    expect(editorMock.handle.focus).toHaveBeenCalled();
  });

  it("goes Back through the root", () => {
    const { props } = renderEditor(titled);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(props.onBack).toHaveBeenCalled();
  });

  it("sits under the app navigation only where there is one", () => {
    const { unmount } = renderEditor(titled);
    expect(screen.getByRole("banner").className).toContain("md:top-[var(--app-nav-height)]");
    unmount();

    renderEditor(titled, { hasAppNav: false });
    expect(screen.getByRole("banner").className).not.toContain("md:top-");
  });
});
