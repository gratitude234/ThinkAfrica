import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorHandle } from "@/components/editor/Editor";
import ArticleMobileToolbar, { NO_FORMATS, type FormatState } from "./ArticleMobileToolbar";

const editor = {
  undo: vi.fn(),
  redo: vi.fn(),
  toggleBold: vi.fn(),
  toggleItalic: vi.fn(),
  toggleH2: vi.fn(),
  toggleH3: vi.fn(),
  toggleBulletList: vi.fn(),
  toggleOrderedList: vi.fn(),
  toggleBlockquote: vi.fn(),
  insertDivider: vi.fn(),
  triggerImageUpload: vi.fn(),
  insertLink: vi.fn(() => "linked"),
  getLinkHref: vi.fn((): string | null => null),
  returnFocus: vi.fn(),
  setTextAlign: vi.fn(),
};
const editorRef = { current: editor as unknown as EditorHandle };

function show(
  formats: Partial<FormatState> = {},
  history = { canUndo: true, canRedo: false },
  active = true
) {
  return render(
    <ArticleMobileToolbar
      editorRef={editorRef}
      formats={{ ...NO_FORMATS, ...formats }}
      history={history}
      active={active}
    />
  );
}

describe("ArticleMobileToolbar", () => {
  beforeEach(() => {
    for (const fn of Object.values(editor)) fn.mockClear();
    editor.insertLink.mockImplementation(() => "linked");
  });

  it("puts undo and redo first, since a phone has no Cmd+Z", () => {
    show();

    const labels = within(screen.getByRole("toolbar", { name: "Formatting" }))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Undo", "Redo", "Bold", "Italic", "Link", "Heading", "Quote", "More formatting", "Insert",
    ]);
  });

  it("calls the editor, and disables what history cannot do", () => {
    show();

    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(editor.undo).toHaveBeenCalled();
  });

  it("keeps focus in the body when a button is tapped", () => {
    show();

    // A default mousedown moves focus to the button, which closes the phone's
    // keyboard and drops this toolbar to the bottom of the screen.
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "Bold" }))).toBe(false);
  });

  it("marks the formats already applied", () => {
    show({ bold: true });

    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Italic" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps H3, lists and alignment under More", () => {
    show({ align: "center" });

    fireEvent.click(screen.getByRole("button", { name: "More formatting" }));

    for (const label of ["Subheading", "Bulleted list", "Numbered list", "Align left", "Align centre", "Align right", "Justify"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Align centre" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Justify" }));
    expect(editor.setTextAlign).toHaveBeenCalledWith("justify");
  });

  it("offers an image and a divider under +", () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Insert" }));
    fireEvent.click(screen.getByRole("button", { name: "Image" }));

    expect(editor.triggerImageUpload).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Divider" })).not.toBeInTheDocument();
  });

  it("swaps the row for a link field when there is text to link", () => {
    show({ hasSelection: true });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(screen.queryByRole("toolbar", { name: "Formatting" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Link address"), { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(editor.insertLink).toHaveBeenCalledWith("example.com");
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("asks for a selection instead of linking nothing", () => {
    show({ hasSelection: false });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.getByRole("status")).toHaveTextContent("Select the words you want to link first.");
    expect(screen.queryByLabelText("Link address")).not.toBeInTheDocument();
    expect(editor.insertLink).not.toHaveBeenCalled();
  });

  it("opens an existing link with its address", () => {
    editor.getLinkHref.mockReturnValueOnce("https://example.com/story");
    show({ link: true });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(screen.getByLabelText("Link address")).toHaveValue("https://example.com/story");
  });

  it("keeps the field open and says why when the address is not a link", () => {
    editor.insertLink.mockImplementation(() => "invalid-address");
    show({ hasSelection: true });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(screen.getByLabelText("Link address"), { target: { value: "hrbdbf" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a web address, like example.com.");
    expect(screen.getByLabelText("Link address")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Link address"), { target: { value: "hrbdbf.com" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("returns the caret to the body on Cancel", () => {
    show({ hasSelection: true });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(editor.returnFocus).toHaveBeenCalled();
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("stays out of the way while the body does not have focus", () => {
    show({}, undefined, false);

    expect(screen.queryByRole("toolbar", { name: "Formatting" })).not.toBeInTheDocument();
  });

  it("stays up while its own link field has focus, and closes its menus when the body loses it", () => {
    const view = show({ hasSelection: true });

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    view.rerender(
      <ArticleMobileToolbar editorRef={editorRef} formats={{ ...NO_FORMATS, hasSelection: true }} history={{ canUndo: true, canRedo: false }} active={false} />
    );
    expect(screen.getByLabelText("Link address")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    view.rerender(
      <ArticleMobileToolbar editorRef={editorRef} formats={NO_FORMATS} history={{ canUndo: true, canRedo: false }} active />
    );
    fireEvent.click(screen.getByRole("button", { name: "More formatting" }));
    view.rerender(
      <ArticleMobileToolbar editorRef={editorRef} formats={NO_FORMATS} history={{ canUndo: true, canRedo: false }} active={false} />
    );
    view.rerender(
      <ArticleMobileToolbar editorRef={editorRef} formats={NO_FORMATS} history={{ canUndo: true, canRedo: false }} active />
    );
    expect(screen.queryByRole("button", { name: "Subheading" })).not.toBeInTheDocument();
  });
});
