import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContributionSnapshot } from "@/lib/contribution";
import { emptySnapshot, fakeDraft } from "@/lib/testUtils/contributionDraft";
import { editorMock, resetEditorMock } from "@/lib/testUtils/mockEditor";
import type { ContributionDraft } from "./useContributionDraft";
import PostComposer, { type PostComposerProps } from "./PostComposer";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("next/dynamic", () => import("@/lib/testUtils/mockEditor").then((m) => m.dynamicMock));
vi.mock("@/lib/uploadImage", () => ({ uploadImage: (file: File) => mocks.upload(file) }));
vi.mock("@/components/ui/UserAvatar", () => ({
  default: ({ name }: { name: string }) => <span>{`Avatar of ${name}`}</span>,
}));

const photo = new File(["png"], "photo.png", { type: "image/png" });
const text = { content: "<p>A thought worth sharing today.</p>" };

function renderComposer(
  snapshot: Partial<ContributionSnapshot> = {},
  props: Partial<PostComposerProps> = {},
  draftOverrides: Partial<ContributionDraft> = {}
) {
  const draft = fakeDraft(snapshot, draftOverrides);
  const all: PostComposerProps = {
    draft,
    mode: "new",
    authorName: "Ada",
    avatarUrl: null,
    username: "ada",
    hasAppNav: true,
    onBack: vi.fn(),
    onDiscard: vi.fn(),
    onSwitchToArticle: vi.fn(),
    withCompleteProfile: vi.fn((next: () => void) => next()),
    ...props,
  };
  const view = render(<PostComposer {...all} />);
  return { draft, props: all, ...view };
}

function lastUpdate(draft: ContributionDraft) {
  const calls = (draft.setSnapshot as Mock).mock.calls;
  return calls[calls.length - 1][0] as (current: ContributionSnapshot) => ContributionSnapshot;
}

describe("PostComposer", () => {
  beforeEach(() => {
    resetEditorMock();
    mocks.upload.mockReset().mockResolvedValue({ ok: true, url: "https://cdn.example/photo.png" });
  });

  it("is a Post card with a byline and no title field", () => {
    renderComposer();

    expect(screen.getByRole("heading", { name: "New post" })).toBeInTheDocument();
    expect(screen.getByText("Avatar of Ada")).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    const body = screen.getByLabelText("Publication body");
    expect(body).toHaveAttribute("placeholder", "Share an idea, a link, a moment.");
    expect(body).toHaveAttribute("data-variant", "post");
  });

  it("holds the Post button until there is text", () => {
    renderComposer();

    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
  });

  it("publishes straight from the Post button, with no settings step", () => {
    const { draft, props } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    expect(props.withCompleteProfile).toHaveBeenCalled();
    expect(draft.publish).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("posts on Cmd+Enter, before the editor can take the keys for a line break", () => {
    const { draft } = renderComposer(text);
    const body = screen.getByLabelText("Publication body");
    const editorSawIt = vi.fn();
    body.addEventListener("keydown", editorSawIt);

    fireEvent.keyDown(body, { key: "Enter", metaKey: true });

    expect(draft.publish).toHaveBeenCalled();
    expect(editorSawIt).not.toHaveBeenCalled();
  });

  it("goes Back through the root", () => {
    const { props } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(props.onBack).toHaveBeenCalled();
  });

  it("says Edit post and Update for a published Post", () => {
    renderComposer(text, { mode: "published-edit" });

    expect(screen.getByRole("heading", { name: "Edit post" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
  });

  it("attaches a chosen image as the Post's image", async () => {
    const { draft, container } = renderComposer(text);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

    await act(async () => {
      fireEvent.change(input, { target: { files: [photo] } });
    });

    expect(mocks.upload).toHaveBeenCalledWith(photo);
    expect(lastUpdate(draft)(emptySnapshot).coverImageUrl).toBe("https://cdn.example/photo.png");
  });

  it("attaches a pasted image instead of placing it in the text", async () => {
    renderComposer(text);

    await act(async () => {
      editorMock.props?.onImageFile?.(photo);
    });

    expect(mocks.upload).toHaveBeenCalledWith(photo);
  });

  it("shows the image at its own shape, and removes it", () => {
    const { draft } = renderComposer({ ...text, coverImageUrl: "https://cdn.example/photo.png" });

    expect(document.querySelector('img[src="https://cdn.example/photo.png"]')).toHaveClass("object-contain");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));

    expect(lastUpdate(draft)({ ...emptySnapshot, coverImageUrl: "x" }).coverImageUrl).toBe("");
  });

  it("says what went wrong when an image will not upload", async () => {
    mocks.upload.mockResolvedValue({ ok: false, error: "That file is not an image." });
    const { container } = renderComposer(text);

    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [photo] } });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("That file is not an image.");
  });

  it("holds the Post button while an image uploads", async () => {
    let finish: (value: { ok: true; url: string }) => void = () => {};
    mocks.upload.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { container } = renderComposer(text);

    await act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [photo] } });
    });
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    expect(screen.getByText("Adding image…", { selector: "[aria-live]" })).toBeInTheDocument();

    await act(async () => finish({ ok: true, url: "https://cdn.example/photo.png" }));
    expect(screen.getByRole("button", { name: "Post" })).toBeEnabled();
  });

  it("saves a draft and discards through the menu", () => {
    const { draft, props } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.queryByRole("menuitem", { name: /Sources/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Save draft" }));
    expect(draft.flush).toHaveBeenCalledWith({ force: true });

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard" }));
    expect(props.onDiscard).toHaveBeenCalled();
  });

  it("goes to the drafts list through the save", () => {
    const { draft } = renderComposer(text);

    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Drafts" }));

    expect(draft.requestClose).toHaveBeenCalledWith("/ada?tab=drafts");
  });

  it("switches to the Article editor from a quiet link beside the image button", () => {
    const { props } = renderComposer(text);

    const imageButton = screen.getByRole("button", { name: "Add image" });
    const articleLink = screen.getByRole("button", { name: "Write an article instead" });
    // One row, the same order at every size: the image first, then the Article.
    expect(imageButton.parentElement).toBe(articleLink.parentElement);
    expect(imageButton.compareDocumentPosition(articleLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(imageButton).toHaveTextContent("Image");

    fireEvent.click(articleLink);
    expect(props.onSwitchToArticle).toHaveBeenCalled();
  });

  it("is a full page under the shared header, not a floating card", () => {
    renderComposer();

    const section = screen.getByRole("region", { name: "New post" });
    expect(section.className).not.toContain("rounded-2xl");
    expect(within(section).getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "More options" })).toBeInTheDocument();
  });
});
